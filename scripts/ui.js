function makeEl(tag, className) {
  var el = document.createElement(tag);
  if (className)
    el.setAttribute("class", className);
  return el;
}

var MainUI = {
  list: null,
  library: null,
  libraryCallback: null,

  init: function() {
    this.list = document.querySelector("#library-list .scrollbox");
    this.library = document.querySelector("#library .scrollbox");
    this.showArtists();
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
      var tracks = makeEl("ol", "album-tracks");
      div.appendChild(tracks);
      
      XBMC.getSongs({ albumid: album.albumid }).then(function(songs) {
        for (var i = 0; i < songs.length; i++) {
          var track = makeEl("li");
          track.textContent = songs[i].track + ": " + songs[i].label;
          tracks.appendChild(track);
        }
      });
    }

    for (var i = 0; i < albums.length; i++) {
      var div = makeEl("div", "album");

      var thumb = makeEl("img", "album-thumbnail");
      thumb.setAttribute("src", XBMC.decodeImage(albums[i].thumbnail));
      div.appendChild(thumb);

      var header = makeEl("p", "album-header");
      div.appendChild(header);

      var title = makeEl("span", "album-title");
      title.textContent = albums[i].label;
      header.appendChild(title);

      var artist = makeEl("span", "album-artist");
      artist.textContent = "By " + albums[i].displayartist;
      header.appendChild(artist);

      fillTracks(div, albums[i]);

      this.library.appendChild(div);
    }
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
  XBMC.init("127.0.0.1").then(function() {
    MainUI.init();
  });
}

function destroy() {
}
