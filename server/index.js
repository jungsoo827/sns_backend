var restify = require('restify');
var u = require('../api/urls');
var bunyan = require('bunyan');
var logger = bunyan.createLogger({
    name: 'seguir',
    serializers: restify.bunyan.serializers
});

function bootstrapServer(config, keyspace, next) {

  var client = require('../api/db/client')(config);
  var messaging = require('../api/db/messaging')(config);
  var api = require('../index')(client, messaging, keyspace);

  var server = restify.createServer({
    name:'seguir',
    version:'0.1.0',
    log: logger
  });

  // Default middleware
  server.use(restify.bodyParser({mapParams: true}));
  server.use(restify.queryParser({ mapParams: false }));
  server.use(restify.gzipResponse());
  server.use(restify.CORS());
  server.use(restify.requestLogger());

  server.get(/\/docs\/current\/?.*/, restify.serveStatic({
    directory: './doc',
    default: 'index.html'
  }));

  server.get('/status', function(req, res) {
    api.auth.getAccounts(function(err, accounts) {
      if(err) { return _error(err); }
      res.send({status:'OK', config: config, accounts: accounts});
    });
  });

  // Preflight
  server.pre(restify.pre.sanitizePath());
  server.pre(restify.pre.userAgentConnection());
  server.pre(function (request, response, next) {
      if(config.logging) {
        request.log.info({ req: request }, 'REQUEST');
      }
      next();
  });
  server.pre(api.auth.checkRequest);

  var coerce = api.auth.coerceUserToUuid;

  function _error(err) {
    return new restify.HttpError(err);
  }

  /**
   * @apiDefine ApiUsers Users
   * This is a collection of methods that allow you to create and retrieve users.
   */

  /**
   * @api {post} /user Add a user
   * @apiName Users
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Creates a new user.
   * @apiParam {String} username the name of the user
   * @apiParam {String} altid the alternate ID of the user
   * @apiParam {Object} userdata arbitrary user data
   *
   * @apiExample {curl} Example usage:
   *     curl --data "username=cliftonc" http://localhost:3000/user
   *
   *  @apiUse MissingUsername
   *  @apiUse ServerError
   *  @apiUse addUserSuccessExample
   */
  server.post(u('addUser'), function (req, res, next) {
    if(!req.params.username) {
      return next(new restify.InvalidArgumentError("You must provide a username."));
    }
    api.manage.addUser(req.keyspace, req.params.username, req.params.altid, req.params.userdata, function(err, user) {
      if(err) { return next(_error(err)); }
      res.send(user);
    });
  });


  /**
   * @api {get} /username/:username Get a specific user
   * @apiName GetUser
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific user
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/username/cliftonc
   *
   * @apiParam {String} username The name of the user
   *
   *  @apiUse getUserByNameSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserByName'), function (req, res, next) {
    api.query.getUserByName(req.keyspace, req.params.username, function(err, user) {
        if(err) { return next(_error(err)); }
        res.send(user);
    });
  });

  /**
   * @api {get} /user/:id Get a specific user by id
   * @apiName GetUser
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific user by id
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/user/cbeab41d-2372-4017-ac50-d8d63802d452
   *
   * @apiParam {String} user The id of the user
   * @apiUse getUserSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUser'), function (req, res, next) {
    coerce(req.keyspace, req.params.user, function(err, user) {
      if(err) { return next(_error(err)); }
      if(!user) { return next(_error({statusCode:404,message:'User not found'})); }
      api.query.getUser(req.keyspace, user, function(err, user) {
        if(err) { return next(_error(err)); }
        res.send(user);
      });
    });
  });

  /**
   * @api {get} /useraltid/:id Get a specific user by altid
   * @apiName GetUser
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific user by altid
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/useraltid/1234
   *
   * @apiParam {String} id The alternate id of the user as a string
   * @apiUse getUserByAltIdSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserByAltId'), function (req, res, next) {
    api.query.getUserByAltId(req.keyspace, req.params.altid, function(err, user) {
        if(err) { return next(_error(err)); }
        res.send(user);
    });
  });

  /**
   * @api {get} /user/:id/relationship Get details of a relationship
   * @apiName GetUserRelationship
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription
   *
   * Retrieves details of a specific user relationship with the current logged in user, intended to be used
   * when viewing someone elses profile.
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/user/cbeab41d-2372-4017-ac50-d8d63802d452/relationship
   *
   * @apiParam {String} user The id of the user
   * @apiUse getUserRelationshipSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserRelationship'), function (req, res, next) {
    if(!req.liu.user) {
      return next(new restify.UnauthorizedError('You must be logged in to access a friend request list.'));
    }
    coerce(req.keyspace, req.params.user, function(err, user) {
      if(err) { return next(_error(err)); }
      api.query.getUserRelationship(req.keyspace, req.liu.user, user, function(err, relationship) {
          if(err) { return next(_error(err)); }
          res.send(relationship);
      });
    });
  });

  /**
   * @apiDefine ApiLikes Likes
   *
   * This is a collection of methods that allow you to create and retrieve likes.
   */

  /**
   * @api {post} /like Add a like by a user
   * @apiName AddLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Creates a new like of an item
   *
   * @apiExample {curl} Example usage:
   *     curl --data "user=405d7e5e-c028-449c-abad-9c11d8569b8f&item=github.com" http://localhost:3000/like
   *
   * @apiParam {Guid} user the guid representation of the user
   * @apiParam {String} item a canonical url to the item liked
   * @apiUse addLikeSuccessExample
   *
   *  @apiUse MissingUsername
   *  @apiUse MissingItem
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   */
  server.post(u('addLike'), function (req, res, next) {
    if(!req.params.user) {
      return next(new restify.InvalidArgumentError("You must provide a user."));
    }
    if(!req.params.item) {
      return next(new restify.InvalidArgumentError("You must provide an item."));
    }
    coerce(req.keyspace, req.params.user, function(err, user) {
      if(err) { return next(_error(err)); }
      api.manage.addLike(req.keyspace, user, req.params.item, Date.now(), function(err, like) {
        if(err) { return next(_error(err)); }
        res.send(like);
      });
    });
  });

  /**
   * @api {get} /like/:like Get a specific like
   * @apiName GetLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific like
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/like/405d7e5e-c028-449c-abad-9c11d8569b8f/github.com
   *
   * @apiParam {Guid} post The guid of the like
   * @apiUse getLikeSuccessExample
   *
   *  @apiUse ServerError
   *
   */
  server.get(u('getLike'), function (req, res, next) {
    api.query.getLike(req.keyspace, req.params.like, function(err, like) {
      if(err) { return next(_error(err)); }
      res.send(like);
    });
  });

  /**
   * @api {get} /user/:user/like/:item Check a specific like
   * @apiName CheckLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Checks if a user likes a specific item, typically the item is a canonical url.
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/like/405d7e5e-c028-449c-abad-9c11d8569b8f/github.com
   *
   * @apiParam {Guid} user The guid of the user
   * @apiParam {String} item The item to check
   * @apiUse checkLikeSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('checkLike'), function (req, res, next) {
    coerce(req.keyspace, req.params.user, function(err, user) {
      if(err) { return next(_error(err)); }
      api.query.checkLike(req.keyspace, user, encodeURIComponent(req.params.item), function(err, like) {
        if(err) { return next(_error(err)); }
        res.send(like);
      });
    });
  });

  /**
   * @api {delete} /user/:user/like/:item Remove a like.
   * @apiName RemoveLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a like
   * @apiParam {Guid} user The guid of the user
   * @apiParam {String} item The item to check
   * @apiUse removeLikeSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   */
  server.del(u('removeLike'), function (req, res, next) {
    if(!req.params.user) {
      return next(new restify.InvalidArgumentError("You must provide a user."));
    }
    if(!req.params.item) {
      return next(new restify.InvalidArgumentError("You must provide an item."));
    }
    coerce(req.keyspace, req.params.user, function(err, user) {
      if(err) { return next(_error(err)); }
      if(req.liu.user !== user) {
        return next(new restify.ForbiddenError("You can't delete someone elses like."));
      }
      api.manage.removeLike(req.keyspace, req.liu.user, encodeURIComponent(req.params.item), function(err, result) {
        if(err) { return next(_error(err)); }
        res.send(result);
      });
    });
  });

  /**
   * @apiDefine ApiPosts Posts
   *
   * This is a collection of methods that allow you to create and retrieve posts.
   */

  /**
   * @api {post} /post Add a post by a user
   * @apiName AddPost
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Creates a new post, by default all new posts are public, and so can be seen by all users.
   * @apiParam {String} user of the user
   * @apiParam {String} content of the post
   * @apiParam {Timestamp} timestamp the time that the post occurred
   * @apiParam {Boolean} private is the post private, e.g. only for friends
   * @apiParam {Boolean} private is the post personal, e.g. only for you
   * @apiUse addPostSuccessExample
   *
   *  @apiUse MissingUser
   *  @apiUse MissingContent
   *  @apiUse ServerError
   */
  server.post(u('addPost'), function (req, res, next) {

    if(!req.params.user) {
      return next(new restify.InvalidArgumentError("You must provide a user."));
    }
    if(!req.params.content) {
      return next(new restify.InvalidArgumentError("You must provide content for the post."));
    }
    var isprivate = req.params.isprivate ? true : false,
        ispersonal = req.params.ispersonal ? true : false;

    coerce(req.keyspace, req.params.user, function(err, user) {
      if(err) { return next(_error(err)); }
      api.manage.addPost(req.keyspace, user, req.params.content, Date.now(), isprivate, ispersonal, function(err, post) {
        if(err) { return next(_error(err)); }
        res.send(post);
      });
    });
  });

  /**
   * @api {get} /post/:post Get a specific post
   * @apiName GetPost
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific post
   * @apiParam {Guid} post The guid of the post
   * @apiUse getPostSuccessExample
   *
   *  @apiUse ServerError
   */
  server.get(u('getPost'), function (req, res, next) {
    api.query.getPost(req.keyspace, req.liu.user, req.params.post, function(err, post) {
        if(err) { return next(_error(err)); }
        res.send(post);
    });
  });

  /**
   * @api {delete} /post/:post Remove a post.
   * @apiName RemovePost
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a post
   * @apiParam {String} post the guid representation of the post
   * @apiUse removePostSuccessExample
   *
   *  @apiUse MissingPost
   *  @apiUse ServerError
   */
  server.del(u('removePost'), function (req, res, next) {
    if(!req.params.post) {
      return next(new restify.InvalidArgumentError("You must provide a post guid."));
    }
    api.manage.removePost(req.keyspace, req.liu.user, req.params.post, function(err, result) {
      if(err) { return next(_error(err)); }
      res.send(result);
    });
  });

 /**
   * @api {get} /friend/:friend Get friend
   * @apiName GetFriend
   * @apiGroup ApiFriends
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a specific relationship information
   * @apiParam {String} user the guid of the user
   * @apiUse getFriendSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFriend'), function (req, res, next) {
    coerce(req.keyspace, req.params.friend, function(err, friend) {
      if(err) { return next(_error(err)); }
      api.query.getFriend(req.keyspace, req.liu.user, friend, function(err, friend) {
        if(err) { return next(_error(err)); }
        res.send(friend);
      });
    });
  });

  /**
   * @api {get} /user/:user/friends Get friends for a user
   * @apiName GetFriends
   * @apiGroup ApiFriends
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of friends for a specific user
   * @apiParam {String} user the guid of the user
   * @apiUse getFriendsSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFriends'), function (req, res, next) {
    coerce(req.keyspace, req.params.user, function(err, user) {
      if(err) { return next(_error(err)); }
      api.query.getFriends(req.keyspace, req.liu.user, user, function(err, friends) {
        if(err) { return next(_error(err)); }
        res.send(friends);
      });
    });
  });

/**
   * @api {delete} /user/:user/friend/:user_friend Remove a friendship.
   * @apiName RemoveFriend
   * @apiGroup ApiFriends
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a friendship (both sides)
   * @apiParam {String} user the guid representation of the user
   * @apiParam {String} user_friend the guid representation of the user they dont want to be friends with
   * @apiUse removeFriendSuccessExample
   *  @apiUse MissingUser
   *  @apiUse MissingFriend
   *  @apiUse ServerError
   */
  server.del(u('removeFriend'), function (req, res, next) {
    if(!req.params.user) {
      return next(new restify.InvalidArgumentError("You must provide a user guid."));
    }
    if(!req.params.user_friend) {
      return next(new restify.InvalidArgumentError("You must provide a user_friend guid."));
    }
    coerce(req.keyspace, [req.params.user, req.params.user_friend], function(err, users) {
      if(err) { return next(_error(err)); }
      var user = users[0], user_friend = users[1];
      if(user !== req.liu.user) {
        return next(new restify.ForbiddenError("You can only remove your own friendships."));
      }
      api.manage.removeFriend(req.keyspace, user, user_friend, function(err, result) {
        if(err) { return next(_error(err)); }
        res.send(result);
      });
    });
  });

/**
   * @apiDefine ApiFriendRequests Friend Requests
   *
   * This is a collection of methods that allow you to use the friend request workflow (instead of creating friends automatically).
   */
  /**
   * @api {post} /friend-request Submit a new friend request
   * @apiName AddFriendRequest
   * @apiGroup ApiFriendRequests
   * @apiVersion 1.0.0
   *
   * @apiDescription Adds a new friend request.
   * @apiParam {String} user_friend the guid of the user to become friends with
   * @apiParam {String} message the message to leave
   * @apiUse addFriendRequestSuccessExample
   *
   *  @apiUse MissingUser
   *  @apiUse MissingFriend
   *  @apiUse ServerError
   */
  server.post(u('addFriendRequest'), function (req, res, next) {
    if(!req.params.user_friend) {
      return next(new restify.InvalidArgumentError("You must provide a user_friend id."));
    }
    coerce(req.keyspace, req.params.user_friend, function(err, user_friend) {
      if(err) { return next(_error(err)); }
      api.manage.addFriendRequest(req.keyspace, req.liu.user, user_friend, req.params.message || '', Date.now(), function(err, friend_request) {
        if(err) { return next(_error(err)); }
        res.send(friend_request);
      });
    });
  });

  /**
   * @api {get} /friend-request/active Get active friend requests
   * @apiName GetFriendRequests
   * @apiGroup ApiFriendRequests
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves active friend Requests for logged in user (inbound and outbound)
   * @apiUse getFriendRequestsSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFriendRequests'), function (req, res, next) {
    if(!req.liu.user) {
      return next(new restify.UnauthorizedError('You must be logged in to access a friend request list.'));
    }
    api.query.getFriendRequests(req.keyspace, req.liu.user, function(err, friend_requests) {
      if(err) { return next(_error(err)); }
      res.send(friend_requests);
    });
  });

  /**
   * @api {post} /friend-request/accept Accept a friend request
   * @apiName AcceptFriendRequest
   * @apiGroup ApiFriendRequests
   * @apiVersion 1.0.0
   *
   * @apiDescription Accepts a friend request.
   * @apiParam {String} friend_request the guid of the user to become friends with
   * @apiUse acceptFriendRequestSuccessExample

   *  @apiUse MissingUser
   *  @apiUse MissingFriend
   *  @apiUse ServerError
   */
  server.post(u('acceptFriendRequest'), function (req, res, next) {
    if(!req.params.friend_request) {
      return next(new restify.InvalidArgumentError("You must provide a friend_request guid."));
    }
    api.manage.acceptFriendRequest(req.keyspace, req.liu.user, req.params.friend_request, function(err, friend) {
      if(err) { return next(_error(err)); }
      res.send(friend);
    });
  });

   /**
   * @apiDefine ApiFollowers Followers
   *
   * This is a collection of methods that allow you to create and retrieve follows.
   */

  /**
   * @api {post} /follow Add a follower to a user
   * @apiName AddFollower
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Adds a new friend to a user account.
   * @apiParam {Guid} user the guid representation of the user who will be followed
   * @apiParam {Guid} user_follower the guid of the user who will be the follower
   * @apiParam {Boolean} private is the follow private, e.g. only for friends
   * @apiParam {Boolean} private is the follow personal, e.g. only for you
   * @apiUse followUserSuccessExample
   *
   *  @apiUse MissingUsername
   *  @apiUse MissingFollow
   *  @apiUse ServerError
   */
  server.post(u('addFollower'), function (req, res, next) {
    if(!req.params.user) {
      return next(new restify.InvalidArgumentError("You must provide a user."));
    }
    if(!req.params.user_follower) {
      return next(new restify.InvalidArgumentError("You must provide a user_follower."));
    }

    var isprivate = req.params.isprivate ? true : false,
        ispersonal = req.params.ispersonal ? true : false;

    coerce(req.keyspace, [req.params.user, req.params.user_follower], function(err, users) {
      if(err) { return next(_error(err)); }
      var user = users[0], user_follower = users[1];

      if(user_follower !== req.liu.user) {
        return next(new restify.ForbiddenError("You can only add your own follow relationships."));
      }

      api.manage.addFollower(req.keyspace, user, user_follower, Date.now(), isprivate, ispersonal, function(err, follow) {
        if(err) { return next(_error(err)); }
        res.send(follow);
      });
    });

  });


  /**
   * @api {get} /user/:user/followers Get followers for a user
   * @apiName GetFollowers
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of feed items for a specific user
   * @apiParam {String} username the username of the user
   * @apiUse getFollowersSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFollowers'), function (req, res, next) {
    coerce(req.keyspace, req.params.user, function(err, user) {
      if(err) { return next(_error(err)); }
      api.query.getFollowers(req.keyspace, req.liu.user, user, function(err, followers) {
        if(err) { return next(_error(err)); }
        res.send(followers);
      });
    });
  });

  /**
   * @api {get} /followers/:follow Get follow details
   * @apiName GetFollower
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific follow
   * @apiParam {Guid} follow the guid of a specific follow
   * @apiUse getFollowSuccessExample
   *
   *  @apiUse ServerError
   *
   */
  server.get(u('getFollow'), function (req, res, next) {
    api.query.getFollow(req.keyspace, req.liu.user, req.params.follow, function(err, follow) {
      if(err) { return next(_error(err)); }
      res.send(follow);
    });
  });

  /**
   * @api {delete} /user/:user/follower/:user_follower Stop following a user.
   * @apiName RemoveFollower
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a follow
   * @apiParam {String} user the user guid who is currently being followed
   * @apiParam {String} user_follower the user who will stop following the first user
   * @apiUse unFollowUserSuccessExample
   *  @apiUse MissingUser
   *  @apiUse MissingFollow
   *  @apiUse ServerError
   */
  server.del(u('removeFollower'), function (req, res, next) {

    if(!req.params.user) {
      return next(new restify.InvalidArgumentError("You must provide a user id."));
    }
    if(!req.params.user_follower) {
      return next(new restify.InvalidArgumentError("You must provide a user_follower id."));
    }

    coerce(req.keyspace, [req.params.user, req.params.user_follower], function(err, users) {

      if(err) { return next(_error(err)); }
      var user = users[0], user_follower = users[1];

      if(user_follower !== req.liu.user) {
        return next(new restify.ForbiddenError("You can only remove your own follow relationships."));
      }
      api.manage.removeFollower(req.keyspace, user, user_follower, function(err, result) {
        if(err) { return next(_error(err)); }
        res.send(result);
      });

    });

  });

   /**
   * @apiDefine ApiFeeds Feeds
   *
   * This is a collection of methods that allow you to retrieve the news feed for a user.
   */

  /**
   * @api {get} /feed/:user Get a feed for a user
   * @apiName GetFeed
   * @apiGroup ApiFeeds
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of feed items for a specific user
   * @apiParam {String} user the guid of the user
   * @apiUse getFeedSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFeed'), function (req, res, next) {
    var start = req.query.start || null;
    var limit = +req.query.limit || 50;
    coerce(req.keyspace, req.params.user, function(err, user) {
      if(err) { return next(_error(err)); }
      if(!user) { return next(_error({statusCode:404,message:'User ' + req.params.user + ' not found!'})); }
      api.query.getFeedForUser(req.keyspace, req.liu.user, user, start, limit, function(err, feed, more) {
          if(err) { return next(_error(err)); }
          res.send({feed:feed, more:more});
      });
    });
  });

 /**
   * @api {get} /feed/:user/direct Get a direct feed for a user
   * @apiName GetFeedDirect
   * @apiGroup ApiFeeds
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of feed items for a specific user that are directly posted to their feed, so not including items that come via follows or mentions.
   * @apiParam {String} user the guid of the user
   * @apiUse getUserFeedSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserFeed'), function (req, res, next) {
    var start = req.query.start || null;
    var limit = +req.query.limit || 50;
    coerce(req.keyspace, req.params.user, function(err, user) {
      if(err) { return next(_error(err)); }
      if(!user) { return next(_error({statusCode:404,message:'User ' + req.params.user + ' not found!'})); }
      api.query.getUserFeedForUser(req.keyspace, req.liu.user, user, start, limit, function(err, feed, more) {
          if(err) { return next(_error(err)); }
          res.send({feed:feed, more:more});
      });
    });
  });

  next(null, server, client);

}

/* istanbul ignore if */
if(require.main === module) {
  var config = require('./config');
  bootstrapServer(config, config.keyspace, function(err, server, client) {
    server.listen(config.port || 3000, function() {
      console.log('Server %s listening at %s', server.name, server.url);
    });
  });

} else {
  // Used for testing
  module.exports = bootstrapServer;
}

/**
 * @apiDefine MissingUser
 * @apiError (4xx) BadRequestError You did not provide a guid for the user
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "code": "BadRequestError",
 *       "message": "You must provide a user guid."
 *     }
 */

/**
 * @apiDefine MissingUsername
 * @apiError (4xx) BadRequestError You did not provide a username
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "code": "BadRequestError",
 *       "message": "You must provide a username."
 *     }
 */

/**
 * @apiDefine MissingPost
 * @apiError (4xx) BadRequestError You did not provide a post guid
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "code": "BadRequestError",
 *       "message": "You must provide a post guid."
 *     }
 */

/**
 * @apiDefine MissingFriend
 * @apiError (4xx) BadRequestError You did not provide a friend guid
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "code": "BadRequestError",
 *       "message": "You must provide a friend guid."
 *     }
 */

/**
 * @apiDefine MissingFollow
 * @apiError (4xx) BadRequestError You did not provide a follow guid
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "code": "BadRequestError",
 *       "message": "You must provide a follow guid."
 *     }
 */

/**
 * @apiDefine MissingItem
 * @apiError (4xx) BadRequestError You did not provide an item to check
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "code": "BadRequestError",
 *       "message": "You must provide an item."
 *     }
 */

/**
 * @apiDefine MissingContent
 * @apiError (4xx) BadRequestError You did not provide content for the post
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "code": "BadRequestError",
 *       "message": "You must provide content for the post."
 *     }
 */

/**
 * @apiDefine UserNotFound
 * @apiError (4xx) NotFoundError The user was not found.
 * @apiErrorExample Not-Found:
 *     HTTP/1.1 404 Not Found
 *     {
 *       "code": "NotFoundError",
 *       "message": "Could not find that user."
 *     }
 */

/**
 * @apiDefine ServerError
 * @apiError (5xx) ServerError There was a server problem.
 * @apiErrorExample Server-Error:
 *     HTTP/1.1 500 Server Error
 *     {
 *       "code": "NotFoundError",
 *       "message": "Something specific about the server error"
 *     }
 */

// MARKER: Samples
/**
 * @apiDefine addUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "username": "cliftonc",
  "altid": "1",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine getUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "username": "cliftonc",
  "altid": "1",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine getUserByNameSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "username": "cliftonc",
  "altid": "1",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine getUserByAltIdSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "username": "cliftonc",
  "altid": "1",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine addFriendRequestSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "friend_request": "10cf76a8-9245-49d2-a0dc-8249830a3271",
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "user_friend": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
  "message": "Please be my friend",
  "timestamp": 1432390179721
}
 */
/**
 * @apiDefine getFriendRequestsSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "incoming": [],
  "outgoing": [
    {
      "friend_request": "10cf76a8-9245-49d2-a0dc-8249830a3271",
      "user": {
        "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_friend": {
        "user": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
        "username": "phteven",
        "altid": "2",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "message": "Please be my friend",
      "since": "2015-05-23T14:09:39.721Z"
    }
  ]
}
 */
/**
 * @apiDefine acceptFriendRequestSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "friend": "df544f0f-9ef9-4a78-8d64-b578380ffb07",
  "reciprocal": "b16da2dc-e264-4376-abb7-74d499ef998b",
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "user_friend": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
  "timestamp": 1432390179799
}
 */
/**
 * @apiDefine getFriendSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "friend": "df544f0f-9ef9-4a78-8d64-b578380ffb07",
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "user_friend": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
  "since": "2015-05-23T14:09:39.799Z",
  "username_friend": "phteven"
}
 */
/**
 * @apiDefine getFriendsSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
[
  {
    "user_friend": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
    "since": "2015-05-23T14:09:39.799Z"
  }
]
 */
/**
 * @apiDefine removeFriendSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine followUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "follow": "332c097c-6161-4f4c-917d-15e8b3eb0f40",
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "user_follower": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
  "isprivate": false,
  "ispersonal": false,
  "timestamp": 1432390180008
}
 */
/**
 * @apiDefine getFollowSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "follow": "332c097c-6161-4f4c-917d-15e8b3eb0f40",
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "user_follower": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
  "since": "2015-05-23T14:09:40.008Z",
  "isprivate": false,
  "ispersonal": false,
  "username_follower": "phteven"
}
 */
/**
 * @apiDefine getFollowersSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
[
  {
    "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
    "user_follower": "12dc3d19-b0a4-439c-8486-0a442d797229",
    "since": "2015-05-23T14:09:40.027Z",
    "isprivate": false,
    "ispersonal": false
  },
  {
    "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
    "user_follower": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
    "since": "2015-05-23T14:09:40.008Z",
    "isprivate": false,
    "ispersonal": false
  }
]
 */
/**
 * @apiDefine unFollowUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine addPostSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "post": "d31c2bec-6a02-4177-a597-9f9f9abc178d",
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "content": "Hello, this is a post",
  "timestamp": 1432390180185,
  "isprivate": false,
  "ispersonal": false
}
 */
/**
 * @apiDefine getPostSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "post": "d31c2bec-6a02-4177-a597-9f9f9abc178d",
  "content": "Hello, this is a post",
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "posted": "2015-05-23T14:09:40.185Z",
  "isprivate": false,
  "ispersonal": false
}
 */
/**
 * @apiDefine removePostSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine addLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "like": "87c9f0c5-3391-4990-9b94-08f6304d5694",
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "item": "http%3A%2F%2Fgithub.com",
  "timestamp": 1432390180455
}
 */
/**
 * @apiDefine getLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "like": "87c9f0c5-3391-4990-9b94-08f6304d5694",
  "item": "http%3A%2F%2Fgithub.com",
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "since": "2015-05-23T14:09:40.455Z"
}
 */
/**
 * @apiDefine checkLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "like": "87c9f0c5-3391-4990-9b94-08f6304d5694",
  "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
  "since": "2015-05-23T14:09:40.455Z"
}
 */
/**
 * @apiDefine removeLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine getFeedSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "feed": [
    {
      "like": "87c9f0c5-3391-4990-9b94-08f6304d5694",
      "item": "http%3A%2F%2Fgithub.com",
      "user": {
        "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-05-23T14:09:40.455Z",
      "type": "like",
      "timeuuid": "5a5d73b0-0155-11e5-9112-1d7974addb98",
      "date": "2015-05-23T14:09:40.459Z",
      "fromNow": "a few seconds ago",
      "isprivate": false,
      "ispersonal": false,
      "fromFollower": true,
      "isLike": true,
      "isPost": false,
      "isFollow": false,
      "isFriend": false,
      "isUsersItem": true
    },
    {
      "post": "861f5fb3-c0f4-454f-8db6-e32e2e640852",
      "content": "Hello, this is a private post",
      "user": {
        "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "posted": "2015-05-23T14:09:40.229Z",
      "isprivate": true,
      "ispersonal": false,
      "type": "post",
      "timeuuid": "5a3ad080-0155-11e5-9112-1d7974addb98",
      "date": "2015-05-23T14:09:40.232Z",
      "fromNow": "a few seconds ago",
      "fromFollower": true,
      "isLike": false,
      "isPost": true,
      "isFollow": false,
      "isFriend": false,
      "isUsersItem": true
    },
    {
      "post": "d31c2bec-6a02-4177-a597-9f9f9abc178d",
      "content": "Hello, this is a post",
      "user": {
        "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "posted": "2015-05-23T14:09:40.185Z",
      "isprivate": false,
      "ispersonal": false,
      "type": "post",
      "timeuuid": "5a34b600-0155-11e5-9112-1d7974addb98",
      "date": "2015-05-23T14:09:40.192Z",
      "fromNow": "a few seconds ago",
      "fromFollower": true,
      "isLike": false,
      "isPost": true,
      "isFollow": false,
      "isFriend": false,
      "isUsersItem": true
    },
    {
      "follow": "b6d43f90-dabd-4c1e-abb9-372aac30a8f6",
      "user": {
        "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_follower": {
        "user": "12dc3d19-b0a4-439c-8486-0a442d797229",
        "username": "ted",
        "altid": "3",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-05-23T14:09:40.027Z",
      "isprivate": false,
      "ispersonal": false,
      "username_follower": "ted",
      "type": "follow",
      "timeuuid": "5a1bafc0-0155-11e5-9112-1d7974addb98",
      "date": "2015-05-23T14:09:40.028Z",
      "fromNow": "a few seconds ago",
      "fromFollower": true,
      "isLike": false,
      "isPost": false,
      "isFollow": true,
      "isFriend": false,
      "isUsersItem": true
    },
    {
      "follow": "332c097c-6161-4f4c-917d-15e8b3eb0f40",
      "user": {
        "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_follower": {
        "user": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
        "username": "phteven",
        "altid": "2",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-05-23T14:09:40.008Z",
      "isprivate": false,
      "ispersonal": false,
      "username_follower": "phteven",
      "type": "follow",
      "timeuuid": "5a1917b0-0155-11e5-9112-1d7974addb98",
      "date": "2015-05-23T14:09:40.011Z",
      "fromNow": "a few seconds ago",
      "fromFollower": true,
      "isLike": false,
      "isPost": false,
      "isFollow": true,
      "isFriend": false,
      "isUsersItem": true
    },
    {
      "friend": "df544f0f-9ef9-4a78-8d64-b578380ffb07",
      "user": {
        "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_friend": {
        "user": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
        "username": "phteven",
        "altid": "2",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-05-23T14:09:39.799Z",
      "username_friend": "phteven",
      "type": "friend",
      "timeuuid": "59fb2f70-0155-11e5-9112-1d7974addb98",
      "date": "2015-05-23T14:09:39.815Z",
      "fromNow": "a few seconds ago",
      "isprivate": true,
      "ispersonal": false,
      "fromFollower": true,
      "isLike": false,
      "isPost": false,
      "isFollow": false,
      "isFriend": true,
      "isUsersItem": true
    }
  ],
  "more": null
}
 */
/**
 * @apiDefine getUserFeedSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
[
  {
    "friend": "b16da2dc-e264-4376-abb7-74d499ef998b",
    "user": {
      "user": "ecb77fca-e5fe-4d01-8a09-5f7caab7aa52",
      "username": "phteven",
      "altid": "2",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "user_friend": {
      "user": "d7886226-756d-4bac-9a8d-b4f079f64e0f",
      "username": "cliftonc",
      "altid": "1",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "since": "2015-05-23T14:09:39.799Z",
    "username_friend": "cliftonc",
    "type": "friend",
    "timeuuid": "5a0122e1-0155-11e5-9112-1d7974addb98",
    "date": "2015-05-23T14:09:39.854Z",
    "fromNow": "a few seconds ago",
    "isprivate": true,
    "ispersonal": false,
    "fromFollower": true,
    "isLike": false,
    "isPost": false,
    "isFollow": false,
    "isFriend": true,
    "isUsersItem": false
  }
]
 */
/**
 * @apiDefine getUserRelationshipSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "isFriend": true,
  "isFriendSince": "2015-05-23T14:09:39.799Z",
  "isFriendRequestPending": false,
  "isFriendRequestSince": null,
  "youFollow": false,
  "youFollowSince": null,
  "youFollowPrivate": null,
  "youFollowPersonal": null,
  "theyFollow": true,
  "theyFollowSince": "2015-05-23T14:09:40.008Z",
  "theyFollowPrivate": false,
  "theyFollowPersonal": false,
  "inCommon": []
}
 */
