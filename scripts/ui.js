function makeEl(tag, className) {
  var el = document.createElement(tag);
  if (className)
    el.setAttribute("class", className);
  return el;
}

function timeInMillis(time) {
  var result = time.milliseconds;
  result += time.seconds * 1000;
  result += time.minutes * 60 * 1000;
  result += time.hours * 60 * 60 * 1000;
  return result;
}

function timeFromMillis(millis) {
  var result = {};
  result.milliseconds = millis % 1000;
  millis = Math.floor(millis / 1000);
  result.seconds = millis % 60;
  millis = Math.floor(millis / 60);
  result.minutes = millis % 60;
  result.hours = Math.floor(millis / 60);

  return result;
}

function formatTime(time) {
  result = "";
  if (time.hours > 0) {
    result += time.hours + ":";
    if (time.minutes < 10)
      result += "0";
  }

  result += time.minutes + ":";
  if (time.seconds < 10)
    result += "0";
  result += time.seconds;

  return result;
}

var NowPlaying = {
  init: function() {
    this.play = document.getElementById("play");
    this.pause = document.getElementById("pause");
    this.title = document.getElementById("playing-title");
    this.subline = document.getElementById("playing-subline");
    this.thumbnail = document.getElementById("playing-thumbnail");
    this.elapsed = document.getElementById("elapsed");
    this.remaining = document.getElementById("remaining");
    this.canvas = document.getElementById("scrubber");
    this.content = document.getElementById("playing-content");

    XBMC.getPlaybackState().then(this.onPlaybackStateChanged.bind(this));
    XBMC.addPlaybackListener(this);
  },

  onPlaybackStateChanged: function(properties) {
    if (!properties || properties.state != "playing") {
      this.play.classList.remove("hidden");
      this.pause.classList.add("hidden");
    }
    else {
      this.play.classList.add("hidden");
      this.pause.classList.remove("hidden");
    }

    if (!properties) {
      this.content.classList.add("hidden");
      return;
    }

    this.content.classList.remove("hidden");

    this.title.textContent = properties.item.label;
    this.subline.textContent = properties.item.artist;
    this.thumbnail.src = XBMC.decodeImage(properties.item.thumbnail);

    var elapsed = timeInMillis(properties.time);
    var total = timeInMillis(properties.totaltime);

    this.canvas.width = total / 1000;
    var ctxt = this.canvas.getContext("2d");
    ctxt.fillStyle = "rgb(0,0,0)";

    var percent = (elapsed / total) * this.canvas.width;
    ctxt.clearRect(percent + 1, 0, this.canvas.width - percent, this.canvas.height);
    ctxt.fillRect(0, 0, percent, this.canvas.height);

    this.elapsed.textContent = formatTime(properties.time);
    this.remaining.textContent = formatTime(timeFromMillis(total - elapsed));
  }
};

var PlaylistControl = {
  list: null,

  init: function() {
    this.list = document.querySelector("#playlist .scrollbox");

    XBMC.getPlaylistItems().then(this.onPlaylistAdd.bind(this));
    XBMC.addPlaylistListener(this);

    XBMC.getPlaybackState().then(this.onPlaybackStateChanged.bind(this));
    XBMC.addPlaybackListener(this);
  },

  onPlaybackStateChanged: function(properties) {
    var selected = document.querySelectorAll("#playlist .selected");
    for (var i = 0; i < selected.length; i++)
      selected[i].classList.remove("selected");

    if (!properties)
      return;

    if (properties.position >= 0 && properties.position < this.list.childNodes.length)
      this.list.childNodes[properties.position].classList.add("selected");
  },

  onPlaylistClear: function() {
    this.list.innerHTML = "";
  },

  onPlaylistAdd: function(items) {
    items.forEach(function(item) {
      var li = makeEl("li");

      var link = makeEl("a");
      li.appendChild(link);

      var imagebox = makeEl("div", "playlist-image");
      link.appendChild(imagebox);

      var thumbnail = makeEl("img", "playlist-thumbnail");
      thumbnail.setAttribute("src", XBMC.decodeImage(item.thumbnail));
      imagebox.appendChild(thumbnail);

      var title = makeEl("p", "playlist-title");
      title.appendChild(document.createTextNode(item.label));
      link.appendChild(title);

      this.list.appendChild(li);
    }, this);
  }
};

var MainUI = {
  list: null,
  library: null,
  libraryCallback: null,

  init: function() {
    this.list = document.querySelector("#library-list .scrollbox");
    this.library = document.querySelector("#library .scrollbox");
    this.showArtists();
  },

  playTracks: function(tracks) {
    XBMC.playTracks(tracks);
  },

  playAlbum: function(album) {
    XBMC.getSongs({ albumid: album.albumid }).then(function(songs) {
      MainUI.playTracks(songs);
    });
  },

  highlightSection: function(id) {
    var last = document.querySelectorAll("#sections .selected");
    for (var i = 0; i < last.length; i++)
      last[i].classList.remove("selected");

    document.getElementById("section-" + id).classList.add("selected");
  },

  showArtists: function() {
    this.highlightSection("artists");
    this.prepareList();

    this.libraryCallback = this.populateArtistLibrary;
    return XBMC.getArtists().then(function(artists) {
      MainUI.populateList(artists, "artist");
    });
  },

  showAlbumLibrary: function(albums) {
    this.library.parentNode.classList.remove("loading");

    function fillTracks(div, album) {
      XBMC.getSongs({ albumid: album.albumid }).then(function(songs) {
        var tracks = makeEl("ol", "album-tracks");
        var lastDisc = songs[0].disc;

        songs.forEach(function(song) {
          if (song.disc != lastDisc) {
            div.appendChild(tracks);
            tracks = makeEl("ol", "album-tracks");
            lastDisc = song.disc
          }

          var track = makeEl("li");
          track.textContent = song.track + ": " + song.label;
          tracks.appendChild(track);
          track.addEventListener("click", function() {
            MainUI.playTracks(songs.slice(songs.indexOf(song)));
          }, false);
        });
        div.appendChild(tracks);
      });
    }

    albums.forEach(function(album) {
      var div = makeEl("div", "album");

      var thumb = makeEl("img", "album-thumbnail");
      thumb.setAttribute("src", XBMC.decodeImage(album.thumbnail));
      div.appendChild(thumb);
      thumb.addEventListener("click", function() {
        MainUI.playAlbum(album);
      }, false);

      var header = makeEl("p", "album-header");
      div.appendChild(header);

      var title = makeEl("span", "album-title");
      title.textContent = album.label;
      header.appendChild(title);
      title.addEventListener("click", function() {
        MainUI.playAlbum(album);
      }, false);

      var artist = makeEl("span", "album-artist");
      artist.textContent = "By " + album.displayartist;
      header.appendChild(artist);

      fillTracks(div, album);

      this.library.appendChild(div);
    }, this);
  },

  populateArtistLibrary: function(artist) {
    return XBMC.getAlbums({ artistid: artist.artistid }).then(this.showAlbumLibrary.bind(this));
  },

  showGenres: function() {
    this.highlightSection("genres");
    this.prepareList();

    this.libraryCallback = this.populateGenreLibrary;
    return XBMC.getMusicGenres().then(function(genres) {
      MainUI.populateList(genres, "genre");
    });
  },

  populateGenreLibrary: function(genre) {
    return XBMC.getAlbums({ genreid: genre.genreid }).then(this.showAlbumLibrary.bind(this));
  },

  showTV: function() {
    this.highlightSection("tv");
    this.prepareList();

    this.libraryCallback = this.populateTVLibrary;
    return XBMC.getTVShows().then(function(shows) {
      MainUI.populateList(shows, "show");
    });
  },

  populateTVLibrary: function(show) {
  },

  showMovies: function() {
    this.highlightSection("movies");
    this.prepareList();

    this.libraryCallback = this.populateMovieLibrary;
    return XBMC.getMovieGenres().then(function(shows) {
      MainUI.populateList(shows, "show");
    });
  },

  populateMovieLibrary: function(genre) {
  },

  showAlbums: function() {
    this.highlightSection("albums");
    this.hideList();
  },

  selectListItem: function(item, listitem) {
    var last = document.querySelectorAll("#library-list .selected");
    for (var i = 0; i < last.length; i++)
      last[i].classList.remove("selected");

    listitem.classList.add("selected");
    this.prepareLibrary();
    this.library.parentNode.classList.add("loading");
    this.libraryCallback.call(this, item);
  },

  prepareLibrary: function() {
    this.library.innerHTML = "";
  },

  hideList: function() {
    this.list.parentNode.classList.add("hidden");
    this.prepareLibrary();
  },

  prepareList: function() {
    this.list.parentNode.classList.add("loading");
    this.list.parentNode.classList.remove("hidden");
    this.list.innerHTML = "";
    this.prepareLibrary();
  },

  populateList: function(items, type) {
    this.list.parentNode.classList.remove("loading");

    for (var i = 0; i < items.length; i++) {
      var item = makeEl("li", "list-" + type);

      var link = makeEl("a");
      item.appendChild(link);

      var imagebox = makeEl("div", "list-image");
      link.appendChild(imagebox);

      var thumbnail = makeEl("img", "list-thumbnail");
      thumbnail.setAttribute("src", XBMC.decodeImage(items[i].thumbnail));
      imagebox.appendChild(thumbnail);

      var title = makeEl("p", "list-title");
      title.appendChild(document.createTextNode(items[i].label));
      link.appendChild(title);

      this.list.appendChild(item);

      link.addEventListener("click", function(item, listitem, event) {
        this.selectListItem(item, listitem);
        event.preventDefault();
      }.bind(this, items[i], item), false);
    }
  }
};

function init() {
  XBMC.init("officepi").then(function() {
    document.getElementById("connecting").classList.add("hidden");
    MainUI.init();
    NowPlaying.init();
    PlaylistControl.init();
  });
}

function destroy() {
}
