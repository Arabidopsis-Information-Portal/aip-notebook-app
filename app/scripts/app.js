/*globals _, EpicEditor*/
(function(window, $, _, EpicEditor, undefined) {
  'use strict';

  /* safe logging! */
  var log = Function.prototype.bind.call(console.log, console);

  var Notebook = function( settings ) {
    if ( ! ( this instanceof Notebook ) ) {
      return new Notebook( settings );
    }

    /* templates */
    this.templates = {
      noNotebooks: _.template( '<div class="jumbotron"><h1>You don\'t have any notebooks!</h1><p>Notes are organized into notebooks.<br>Create your first notebook to get started.</p><p><button type="button" class="btn btn-primary" name="create-notebook">Create a notebook</button></div>' ),
      editor:      _.template( '<div><div class="note-meta"></div><div class="editor"></div></div>' ),
      createBook:  _.template( '<form><h1>Create a new Notebook</h1><div class="form-group"><label for="notebookName">Notebook name</label><input type="text" class="form-control" name="notebookName" id="notebookName"></div><div class="form-actions"><button type="submit" class="btn btn-success" name="save">Save</button> <button type="button" class="btn btn-default" name="cancel">Cancel</button></div></form>' ),
      createNote:  _.template( '<form><h1>Create a new Note</h1><div class="form-group"><label for="notebookId">Choose a Notebook</label><select class="form-control" name="notebookId" id="notebookId"><% _.each(books, function(book) { %><option <%= book.uuid === selected ? "selected": "" %> value="<%= book.uuid %>"><%= book.value.name %></option><% }); %></select></div><div class="form-group"><label for="noteTitle">Title</label><input type="text" class="form-control" name="noteTitle" id="noteTitle"></div><div class="form-actions"><button type="submit" class="btn btn-success" name="save">Save</button> <button type="button" class="btn btn-default" name="cancel">Cancel</button></div></form>' ),
      displayBook: _.template( '<div class="book-display"><h1><%= book.value.name %></h1><div class="meta"><span class="label label-default pull-right"><i class="fa fa-book"></i> Notebook</span><p class="text-muted"><b>Created</b> <%= new Date(book.created).toLocaleString() %></p></div><% if (notes && notes.length > 0) { %><table class="notes table table-bordered"><% _.each(notes, function(note) { %><tr><td><%= note.value.title %></td><td><span class="text-muted"><%= new Date(note.created).toLocaleString() %></span></td><td><button data-note-uuid="<%= note.uuid %>" type="button" class="btn btn-xs btn-primary">View</button></td></tr><% });%></table><% } else { %><div class="jumbotron"><p class="alert alert-info">This notebook doesn\'t have any notes!</p><p><button type="button" class="btn btn-primary btn-lg create-note">Create a Note</button></p></div><% } %></div>' ),
      displayNote: _.template( '<div class="note-display"><h1><%= note.value.title %></h1><div class="meta"><span class="label label-default pull-right"><i class="fa fa-file"></i> Note</span><p class="text-muted"><b>Created</b> <%= new Date(note.created).toLocaleString() %></p></div><div class="editor"></div><div class="actions"><span class="text-muted pull-right saving-indicator"><i class="fa fa-refresh fa-spin"></i> Saving...</span><button type="button" class="btn btn-primary save">Save</button> <button type="button" class="btn btn-default preview">Preview</button> <button type="button" class="btn btn-default edit">Edit</button></div></div>' ),
      sidebarBooks: _.template( '<div class="list-group"><% _.each(items, function(item) { %><a class="list-group-item" href="#" data-type="<%= item.name %>" data-uuid="<%= item.uuid %>"><%= item.value.name %></a><% }); %></div>' ),
      sidebarNotes: _.template( '<div class="list-group"><% _.each(items, function(item) { %><a class="list-group-item" href="#" data-type="<%= item.name %>" data-uuid="<%= item.uuid %>"><%= item.value.title %></a><% }); %></div>' )
    };

    this.agave = settings.agave;
    this.meta = this.agave.api.meta; /* convenience! */
    this.$el = $( settings.el );
    this.$display = $( '.app-display-inner', this.$el );
    this.$sidebar = $( '.app-sidebar', this.$el );
    this.currentBook = null;
    this.currentNote = null;
    this.books = [];
    this.notes = {};

    /* init ui */
    var nb = this;
    $( '.sidebar-actions button', this.$el ).on( 'click', function(e) {
      e.preventDefault();
      var action = $( this ).attr( 'data-action' );
      nb[ action ]();
    }).tooltip();
    $( '.sidebar-toggle', this.$el ).on( 'click', function( e ) {
      e.preventDefault();
      nb.$el.toggleClass( 'sidebar-shown' );
    });

    /* bind function context */
    _.bindAll( this,
      'refreshSidebarBooksList',
      'refreshSidebarNotesList',
      'displayDefault',
      'displayBook',
      'displayNote',
      'displayInfo',
      'displayNada',
      'createBook',
      'createNote',
      'selectBook',
      'selectNote',
      'list'
    );
  };

  Notebook.prototype.refreshSidebarBooksList = function() {
    var nb = this;
    var list = $( '.notebook-books .notebook-list', nb.$sidebar );
    return list.empty().html( nb.templates.sidebarBooks( { items: nb.books } ) ).promise()
      .done(function() {
        $( 'a', list ).on('click', function() {
          var book = _.findWhere( nb.books, { uuid: $( this ).attr('data-uuid') });
          nb.selectBook( book );
        });
      });

  };

  Notebook.prototype.refreshSidebarNotesList = function() {
    var nb = this,
      list = $( '.notebook-pages .notebook-list', nb.$sidebar ),
      notes = nb.notes[ nb.currentBook.uuid ];

    list.empty();
    if (notes && notes.length) {
      return list.html( nb.templates.sidebarNotes( { items: notes } ) ).promise()
        .done(function() {
          $( 'a', list ).on('click', function() {
            var note = _.findWhere( nb.notes[ nb.currentBook.uuid ], { uuid: $( this ).attr('data-uuid') });
            nb.selectNote(note);
          });
        });

    } else {
      return list.html('<strong>No notes!</strong>').promise();
    }
  };

  /**
   * Puts the notebook display back to the "default" view depending on the
   * current application state. Will display either the currently selected
   * note, notebook, placeholder, or notebook creation prompt.
   *
   */
  Notebook.prototype.displayDefault = function() {
    if (this.currentNote) {
      // show editor
      this.displayNote();
    } else if (this.currentBook) {
      // show book info
      this.displayBook();
    } else if (this.books.length > 0) {
      // show app info
      this.displayInfo();
    } else {
      // show no data display
      this.displayNada();
    }
  };

  Notebook.prototype.displayBook = function() {
    var nb = this;
    nb.$display.empty(); /* unbinds old events and resets the display */

    var bookData = { book: nb.currentBook, notes: nb.notes[ nb.currentBook.uuid ] };

    nb.$display.html(nb.templates.displayBook(bookData)).promise()
      .done(function() {
        // events for book display
        $('.notes button', nb.$display).on('click', function(e) {
          e.preventDefault();
          var noteUuid = $(this).attr('data-note-uuid');
          nb.currentNote = _.findWhere( nb.notes[ nb.currentBook.uuid ], { uuid: noteUuid } );
          nb.displayNote();
        });
      })
      .done(nb.refreshSidebarNotesList)
      .done(function() {
        // select notes tab
        $('.nav-tabs a:last', nb.$sidebar).tab('show');
      });
  };

  Notebook.prototype.displayNote = function() {
    var nb = this;
    nb.$display.empty(); /* unbinds old events and resets the display */
    nb.$display.html(nb.templates.displayNote({ note: nb.currentNote })).promise()
      .done(function() {
        var opts, editor, scriptPath;

        // find the epiceditor.js load path
        scriptPath = 'epiceditor';
        _.each(document.querySelectorAll('script'), function(tag) {
          if (/epiceditor\/js\/epiceditor(\.min)?\.js/.test(tag.src)) {
            scriptPath = tag.src.replace(/epiceditor\/js\/epiceditor(\.min)?\.js/, 'epiceditor');
          }
        });

        // init epic editor
        opts = {
          container: $('.editor', nb.$display)[0],
          basePath: scriptPath,
          theme: {
            editor: '/themes/editor/epic-light.css'
          },
          focusOnLoad: true,
          file: {
            name: nb.currentNote.uuid,
            defaultContent: nb.currentNote.value.body,
            autoSave: 3000
          },
          button: false,
          autogrow: {
            minHeight: 300,
            maxHeight: 800
          }
        };
        editor = new EpicEditor(opts).load();

        var remoteSave = function remoteSave() {
          nb.currentNote.value.body = editor.exportFile();
          nb.$display.addClass('saving-progress');
          nb.meta.updateMetadata(
            { uuid: nb.currentNote.uuid, body: JSON.stringify(nb.currentNote) },
            function() {
              nb.$display.removeClass('saving-progress');
            },
            function(err) {
              // error
              log(err);
            }
          );
        };

        editor.on('autosave', remoteSave);
        editor.on('save', remoteSave);

        // editor actions
        $('button.save', nb.$display).on('click', function() { editor.save(); });
        $('button.edit', nb.$display).on('click', function() {
          nb.$display.removeClass('previewing');
          editor.edit();
        });
        $('button.preview', nb.$display).on('click', function() {
          nb.$display.addClass('previewing');
          editor.preview();
        });
      });
  };

  Notebook.prototype.displayInfo = function() {
    var nb = this;
    nb.$display.empty(); /* unbinds old events and resets the display */
    nb.$display.html('<div class="jumbotron"><h1>Display App Info</h1></div>');
  };


  Notebook.prototype.displayNada = function() {
    var nb = this;
    nb.$display.empty(); /* unbinds old events and resets the display */
    nb.$display.html(this.templates.noNotebooks()).promise().done(function() {
      $('button[name=create-notebook]', this.$display).on('click', function() {
        nb.createBook();
      });
    });
  };

  Notebook.prototype.createBook = function() {
    var nb = this;
    this.$display.html( this.templates.createBook() ).promise().done(function() {
      $( 'form', nb.$display ).on( 'submit', function(e) {
        e.preventDefault();
        var book = {
          name: 'notebook',
          value: {
            name: this.notebookName.value
          }
        };
        nb.meta.addMetadata( { body: JSON.stringify( book ) }, function( resp ) {
          if (resp.status === 201) {
            nb.currentBook = resp.obj.result;
            nb.books.push( resp.obj.result );
            nb.refreshSidebarBooksList().then(function() {
              nb.selectBook( nb.currentBook );
            });
          } else {
            log( resp );
          }
        });
      });

      $( 'button[name=cancel]', nb.$display ).on( 'click', nb.displayDefault );
    });
  };

  Notebook.prototype.createNote = function() {
    var nb = this;
    nb.$display.html(nb.templates.createNote({
      books: nb.books,
      selected: nb.currentBook ? nb.currentBook.uuid : ''
    })).promise().done(function() {
      $( 'form', nb.$display ).on( 'submit', function(e) {
        e.preventDefault();
        var note = {
          name: 'notebook-page',
          value: {
            notebookId: this.notebookId.value,
            title: this.noteTitle.value
          }
        };

        nb.meta.addMetadata( { body: JSON.stringify( note ) } , function( resp ) {
          if ( resp.status === 201 ) {
            nb.currentNote = resp.obj;

            // add to notes list for book
            var notes = nb.notes[ nb.currentNote.uuid ] || [];
            notes.push( nb.currentNote );

            // set this notes book to the current book
            // ?

            // show this note
            nb.displayNote( nb.currentNote );
          } else {
            log( resp );
          }
        });
      });

      $( 'button[name=cancel]', nb.$display ).on( 'click', nb.displayDefault );
    });
  };

  Notebook.prototype.list = function() {
    var nb = this;
    var deferred = $.Deferred();
    nb.meta.listMetadata({q:'{"name":"notebook"}'}, function(resp) {
      if (resp.status === 200) {
        nb.books = resp.obj.result;
        nb.refreshSidebarBooksList();
        deferred.resolve(nb.books);
      } else {
        deferred.reject(resp);
      }
    });
    return deferred.promise();
  };

  Notebook.prototype.selectBook = function(notebook) {
    var nb = this, deferred = $.Deferred();

    nb.currentBook = notebook;

    if ( ! nb.notes[ nb.currentBook.uuid ] ) {
      var q = {
        name: 'notebook-page',
        'value.notebookId': nb.currentBook.uuid
      };
      this.meta.listMetadata({ q: JSON.stringify(q) }, function( resp ) {
        if ( resp && resp.obj ) {
          nb.notes[ nb.currentBook.uuid ] = resp.obj.result;
          deferred.resolve(nb.currentBook);
        }
      });
    } else {
      deferred.resolve(nb.currentBook);
    }

    var booksList = $( '.notebook-books .notebook-list', nb.$sidebar );
    booksList.find( '.active' ).removeClass( 'active' );
    booksList.find( '[data-uuid="'+ nb.currentBook.uuid +'"]' ).addClass( 'active' );

    return deferred.promise().then(nb.displayBook);
  };

  Notebook.prototype.selectNote = function(note) {
    var nb = this, deferred = $.Deferred();

    nb.currentNote = note;

    // anything else?

    deferred.resolve(note);

    return deferred.promise().then(nb.displayNote);
  };

  /* Listen for Agave::ready */
  window.addEventListener('Agave::ready', function() {
    var nb = new Notebook({el: '.aip-notebook-app', agave: window.Agave});
    nb.list().then(function() {
      if (nb.books.length > 0) {
        return nb.selectBook(nb.books[0]);
      }
    }).done(nb.displayDefault);
  });

})(window, jQuery, _, EpicEditor);
