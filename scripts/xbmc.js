function Connection(socket) {
  this.socket = socket;
  this.id = 1;
  this.queue = [];
  this.locked = false;
}

Connection.prototype = {
  socket: null,
  locked: null,
  queue: null,
  id: null,

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
  var deferred = promise.defer();

  console.info("Connecting to " + url);

  var socket = new WebSocket(url);
  socket.onopen = function onOpen() {
    console.info("Socket connected");

    deferred.resolve(new Connection(socket));
  };

  socket.onclose = function onClose(event) {
    console.error("Socket closed: " + event.reason);
    deferred.reject(event.reason);
  };

  return deferred.promise;
}

var XBMC = {
  _connection: null,

  init: function(host, port) {
    if (!port)
      port = 9090;

    return openConnection("ws://" + host + ":" + port + "/jsonrpc").then(function(connection) {
      XBMC._connection = connection;
    });
  },

  decodeImage: function(image) {
    if (!image.startsWith("image://"))
      return "";

    image = image.substring(8, image.length - 1);
    return decodeURIComponent(image);
  },

  getPlaylist: function(type) {
    return this._connection.send("Playlist.GetPlaylists").then(function(playlists) {
      for (var i = 0; i < playlists.length; i++) {
        if (playlists[i].type == type)
          return playlists[i];
      }

      return null;
    });
  },

  playTracks: function(songs) {
    var connection = this._connection;

    return this.getPlaylist("audio").then(function(playlist) {
      var promise = connection.send("Playlist.Clear", { playlistid: playlist.playlistid });
      if (songs.length == 0)
        return promise;

      // Queue up the first song
      promise.then(function() {
        connection.send("Playlist.Add", {
          playlistid: playlist.playlistid,
          item: {
            songid: songs.shift().songid
          }
        })
      });

      // Start playing it
      promise.then(function() {
        connection.send("Player.Open", {
          item: {
            playlistid: playlist.playlistid,
            position: 0
          }
        });
      });

      // Queue up the rest of the songs
      songs.forEach(function(song) {
        promise.then(function() {
          connection.send("Playlist.Add", {
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

  getSongs: function(filter) {
    return this.getList("AudioLibrary.GetSongs", "songs", {
      properties: ["title", "artist", "track", "disc", "duration"],
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
