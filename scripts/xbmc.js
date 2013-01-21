function Connection(url) {
  this.url = url;
  this.id = 1;
  this.queue = [];
  this.locked = false;
  this.listeners = [];
}

Connection.prototype = {
  url: null,
  socket: null,
  locked: null,
  queue: null,
  id: null,

  connect: function() {
    var deferred = promise.defer();

    console.info("Connecting to " + this.url);

    var self = this;
    var socket = new WebSocket(this.url);

    socket.onopen = function onOpen() {
      console.info("Socket connected");

      self.socket = socket;
      deferred.resolve();
    };

    socket.onclose = function onClose(event) {
      console.error("Socket closed: " + event.reason);

      if (self.socket) {
        // TODO Send out disconnection event
      }

      self.socket = null;
      deferred.resolve(self.connect());
    };

    socket.onmessage = this.onMessage.bind(this);

    return deferred.promise;
  },

  onMessage: function(event) {
    var message = JSON.parse(event.data);
    if ("id" in message)
      return;

    console.log("Received " + message.method);
    this.listeners.forEach(function(listener) {
      try {
        listener(message.method, message.params.data);
      }
      catch (e) {
        console.error(e);
      }
    });
  },

  addNotificationListener: function(callback) {
    this.listeners.push(callback);
  },

  runQueue: function() {
    if (this.locked)
      return;

    if (this.queue.length == 0)
      return;

    this.locked = true;
    [deferred, method, params] = this.queue.shift();

    var id = this.id++;

    this.socket.addEventListener("message", function(event) {
      var msg = JSON.parse(event.data);

      if (msg.id != id)
        return;
      console.log("Socket received response for " + msg.id);
      this.socket.removeEventListener("message", arguments.callee, false);

      if ("result" in msg) {
        deferred.resolve(msg.result);
        this.locked = false;
        this.runQueue();
        return;
      }

      var error = ("error" in msg) ? msg.error.message : undefined;
      console.error("Error: " + error);
      deferred.reject(error);
      this.locked = false;
      this.runQueue();
    }.bind(this), false);

    var msg = {
      jsonrpc: "2.0",
      id: id,
      method: method
    };

    if (params)
      msg.params = params;

    console.log("Socket sending " + JSON.stringify(msg))
    this.socket.send(JSON.stringify(msg));
  },

  send: function(method, params) {
    var deferred = promise.defer();

    this.queue.push([deferred, method, params]);
    this.runQueue();
    return deferred.promise;
  }
};

function openConnection(url) {
  var connection = new Connection(url);

  return connection.connect().then(function() {
    return connection;
  });
}

var XBMC = {
  _connection: null,
  _player: null,
  _playlist: null,
  _host: null,

  _playlistListeners: [],
  _playbackListeners: [],

  init: function(host, port) {
    this._host = host;
    if (!port)
      port = 9090;

    return openConnection("ws://" + host + ":" + port + "/jsonrpc").then(function(connection) {
      XBMC._connection = connection;
      connection.addNotificationListener(XBMC._notificationCallback.bind(XBMC));
      return XBMC._findActivePlayer();
    });
  },

  addPlaylistListener: function(listener) {
    this._playlistListeners.push(listener);
  },

  addPlaybackListener: function(listener) {
    this._playbackListeners.push(listener);
  },

  _notificationCallback: function(method, params) {
    if (method in this._notifications)
      this._notifications[method].call(this, params);
  },

  _notifications: {
    "Playlist.OnClear": function(params) {
      if (params.playlistid != this._playlist.playlistid)
        return;

      this._playlist.items = [];
      this._playlistListeners.forEach(function(listener) {
        try {
          listener.onPlaylistClear();
        }
        catch (e) {
          console.error(e);
        }
      });
    },

    "Playlist.OnAdd": function(params) {
      if (params.playlistid != this._playlist.playlistid)
        return;

      this._getLibraryItem(params.item).then(function(song) {
        XBMC._playlist.items.push(song);
        XBMC._playlistListeners.forEach(function(listener) {
          try {
            listener.onPlaylistAdd([song]);
          }
          catch (e) {
            console.error(e);
          }
        });
      });
    },

    "Player.OnPlay": function(params) {
      clearTimeout(this._timeout);

      this._getPlayerProperties(params.player.playerid).then(function(properties) {
        properties.state = "playing";
        properties.item = XBMC._playlist.items[properties.position];

        if (!XBMC._player || (params.player.playerid != XBMC._player.playerid)) {
          return XBMC._setPlayer({
            playerid: params.player.playerid,
            type: properties.type,
            properties: properties
          });
        }

        XBMC._player.properties = properties;
        XBMC._notifyPlaying();
        XBMC._timeout = setTimeout(XBMC._updateSeekPosition.bind(XBMC), 1000);
      });
    },

    "Player.OnPause": function(params) {
      if (params.player.playerid != this._player.playerid)
        return;

      clearTimeout(this._timeout);

      this._player.properties.state = "paused";
      this._notifyPlaying();
    },

    "Player.OnSeek": function(params) {
      if (params.player.playerid != this._player.playerid)
        return;

      clearTimeout(this._timeout);

      this._notifyPlaying();
    },

    "Player.OnStop": function(params) {
      // TODO check if it is our player that has stopped
      clearTimeout(this._timeout);

      this._player.properties.state = "stopped";
      this._notifyPlaying();
    },
  },

  _timeout: null,
  _timeoutCount: 0,
  _updateSeekPosition: function() {
    this._timeout = null;
    if (this._player.properties.state != "playing")
      return;

    var time = this._player.properties.time;
    time.seconds++;
    while (time.seconds >= 60) {
      time.minutes++;
      time.seconds -= 60;
    }
    while (time.minutes >= 60) {
      time.hours++;
      time.minutes -= 60;
    }

    this._notifyPlaying();

    this._timeout = setTimeout(this._updateSeekPosition.bind(this), 1000);

    this._timeoutCount++;
    if (this._timeoutCount == 10) {
      this._getPlayerProperties(this._player.playerid).then(function(properties) {
        if (XBMC._player.properties.state != "playing")
          return;
        XBMC._timeoutCount = 0;
        clearTimeout(XBMC._timeout)
        XBMC._player.properties.time = properties.time;
        XBMC._notifyPlaying();
        XBMC._timeout = setTimeout(XBMC._updateSeekPosition.bind(XBMC), 1000);
      });
    }
  },

  _notifyPlaying: function() {
    this._playbackListeners.forEach(function(listener) {
      try {
        listener.onPlaybackStateChanged(XBMC._player.properties);
      }
      catch (e) {
        console.error(e);
      }
    });
  },

  _getLibraryItem: function(item) {
    switch (item.type) {
    case "song":
      return this.getSong(item.id);
      break;
    default:
      console.error("Unexpected item type " + params.item.type);
    }
  },

  _setPlaylist: function(playlist) {
    if (this._playlist && playlist.playlistid == this._playlist.playlistid)
      return promise.resolve();

    this._playlist = playlist;
    this._playlist.items = [];

    return this._connection.send("Playlist.GetItems", {
      properties: [ "title", "thumbnail", "artist", "track", "disc", "duration" ],
      playlistid: playlist.playlistid
    }).then(function(results) {
      XBMC._playlist.items = results.items ? results.items : [];
      XBMC._playlistListeners.forEach(function(listener) {
        try {
          listener.onPlaylistClear();
          listener.onPlaylistAdd(results.items);
        }
        catch (e) {
          console.error(e);
        }
      });

      if (XBMC._player) {
        XBMC._player.properties.item = XBMC._playlist.items[XBMC._player.properties.position];
        XBMC._notifyPlaying();
      }
    });
  },

  _getPlayerProperties: function(id) {
    return this._connection.send("Player.GetProperties", {
      playerid: id,
      properties: [ "playlistid", "position", "time", "totaltime", "type" ]
    });
  },

  _setPlayer: function(player) {
    function playerID(player) {
      return player ? player.playerid : null;
    }

    if (this._playlist && (playerID(this._player) == playerID(player)))
      return promise.resolve();

    this._player = player;

    if (!player) {
      if (!this._playlist) {
        return this._getPlaylistForType("audio").then(function(playlist) {
          return XBMC._setPlaylist(playlist);
        });
      }
    }
    else {
      return XBMC._setPlaylist({
        playlistid: player.properties.playlistid,
        type: player.properties.type
      }).then(function() {
        player.properties.item = XBMC._playlist.items[player.properties.position];
        XBMC._timeout = setTimeout(XBMC._updateSeekPosition.bind(XBMC), 1000);
      });
    }
  },

  _findActivePlayer: function(playerid) {
    return this._connection.send("Player.GetActivePlayers").then(function(players) {
      if (players.length == 0) {
        return XBMC._setPlayer(null);
      }

      // TODO find the one with the right ID or default to video
      var player = players[0];

      return XBMC._getPlayerProperties(player.playerid).then(function(properties) {
        properties.state = "playing";
        player.properties = properties;

        return XBMC._setPlayer(player);
      });
    });
  },

  getPlaybackState: function() {
    return promise.resolve(this._player ? this._player.properties : null);
  },

  getPlaylistItems: function() {
    return promise.resolve(this._playlist.items);
  },

  decodeImage: function(image) {
    return "http://" + this._host + "/image/" + encodeURI(image);
  },

  _getPlaylistForType: function(type) {
    return this._connection.send("Playlist.GetPlaylists").then(function(playlists) {
      for (var i = 0; i < playlists.length; i++) {
        if (playlists[i].type == type)
          return playlists[i];
      }

      return null;
    });
  },

  playPause: function() {
    if (!this._player)
      return;

    return this._connection.send("Player.PlayPause", {
      playerid: this._player.playerid
    })
  },

  skip: function(forwards) {
    if (!this._player)
      return;

    if (forwards === undefined)
      forwards = true;

    return this._connection.send("Player.GoTo", {
      playerid: this._player.playerid,
      to: forwards ? "next" : "previous"
    })
  },

  playTracks: function(songs) {
    var connection = this._connection;

    return this._getPlaylistForType("audio").then(function(playlist) {
      var promise = connection.send("Playlist.Clear", { playlistid: playlist.playlistid });
      if (songs.length == 0)
        return promise;

      var first = songs.shift();
      // Queue up the first song
      promise.then(function() {
        return connection.send("Playlist.Add", {
          playlistid: playlist.playlistid,
          item: {
            songid: first.songid
          }
        })
      });

      // Start playing it
      promise.then(function() {
        return connection.send("Player.Open", {
          item: {
            playlistid: playlist.playlistid,
            position: 0
          }
        });
      });

      // Queue up the rest of the songs
      songs.forEach(function(song) {
        promise.then(function() {
          return connection.send("Playlist.Add", {
            playlistid: playlist.playlistid,
            item: {
              songid: song.songid
            }
          });
        });
      });

      return promise;
    });
  },

  queueTracks: function(songs) {
    var connection = this._connection;

    return this._getPlaylistForType("audio").then(function(playlist) {
      var deferred = promise.defer();
      deferred.resolve();

      songs.forEach(function(song) {
        deferred.promise.then(function() {
          return connection.send("Playlist.Add", {
            playlistid: playlist.playlistid,
            item: {
              songid: song.songid
            }
          });
        });
      });

      return deferred.promise;
    });
  },

  getList: function(method, property, extraparams) {
    var params = {
      properties: ["thumbnail"],
      sort: {
        ascending: true,
        ignorearticle: true
      }
    };

    if (extraparams) {
      for (var param in extraparams)
        params[param] = extraparams[param];
    }

    return this._connection.send(method, params).then(function(results) {
      if (results.limits.total == 0)
        return [];
      return results[property].sort(function(a, b) {
        function normalise(str) {
          str = str.toLowerCase();
          if (str.startsWith("the "))
            str = str.substring(4);
          return str;
        }

        a = normalise(a.label);
        b = normalise(b.label);
        return a.localeCompare(b);
      });
    });
  },

  getArtists: function() {
    return this.getList("AudioLibrary.GetArtists", "artists", {
      albumartistsonly: true
    });
  },

  getMusicGenres: function() {
    return this.getList("AudioLibrary.GetGenres", "genres");
  },

  getAlbums: function(filter) {
    return this.getList("AudioLibrary.GetAlbums", "albums", {
      properties: ["thumbnail", "displayartist"],
      filter: filter
    });
  },

  getSong: function(id) {
    return this._connection.send("AudioLibrary.GetSongDetails", {
      songid: id,
      properties: ["title", "thumbnail", "artist", "track", "disc", "duration"]
    }).then(function(result) {
      return result.songdetails;
    });
  },

  getSongs: function(filter) {
    return this.getList("AudioLibrary.GetSongs", "songs", {
      properties: ["title", "thumbnail", "artist", "track", "disc", "duration"],
      filter: filter
    }).then(function(songs) {
      return songs.sort(function(a, b) {
        if (a.disc != b.disc)
          return a.disc - b.disc;
        return a.track - b.track;
      });
    });
  },

  getTVShows: function() {
    return this.getList("VideoLibrary.GetTVShows", "tvshows");
  },

  getMovieGenres: function() {
    return this.getList("VideoLibrary.GetGenres", "genres", {
      type: "movie"
    });
  }
};
