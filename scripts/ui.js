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

  populateArtistLibrary: function(artist) {
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
      var item = document.createElement("li");
      item.setAttribute("class", "list-" + type);

      var link = document.createElement("a");
      item.appendChild(link);
      var thumbnail = document.createElement("img");
      thumbnail.setAttribute("class", "list-thumbnail");
      thumbnail.setAttribute("src", XBMC.decodeImage(items[i].thumbnail));
      link.appendChild(thumbnail);
      link.appendChild(document.createTextNode(items[i].label));
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
