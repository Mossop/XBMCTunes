function Connection(socket) {
  this.socket = socket;
}

Connection.prototype = {
  send: function(method, params) {
    var deferred = promise.defer();
    var id = Date.now();

    this.socket.addEventListener("message", function(event) {
      var msg = JSON.parse(event.data);

      if (msg.id != id)
        return;
      console.log("Socket received response for " + msg.id);

      this.socket.removeEventListener("message", arguments.callee, false);

      if ("result" in msg) {
        deferred.resolve(msg.result);
        return;
      }

      var error = ("error" in msg) ? msg.error : undefined;
      console.error("Error: " + error);
      deferred.reject(error);
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
      filter: filter
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
