/*
 * Offline Handlers for this Application
 * Joseph Pecoraro
 */

/*
 * TODO: Synchronization
 */

// ------------------------
//   Fake Offline Testing
// ------------------------

// DataCache.Offline = true;
// document.addEventListener('now-online', function() {
//     DataCache.Offline = true;
// }, false);


// Prevent Namespace Collisions
(function() {

    // -----------------
    //   UI Indicators
    // -----------------

    function indicateOnline()  { indicate('green', 'online'); }
    function indicateOffline() { indicate('red', 'offline');  }
    function indicate(color, text) {
        var elem = document.getElementById('connectivity');
        elem.style.backgroundColor = color;
        elem.innerHTML = text;
    }

    document.addEventListener('now-online', indicateOnline, false);
    document.addEventListener('now-offline', indicateOffline, false);
    window.addEventListener('load', function() {
        setTimeout(function() {
            (DataCache.Offline ? indicateOffline() : indicateOnline());
        }, 500); // latency is for the initial automated check
    }, false);


    // ------------------------
    //   Table of Saved Items
    // ------------------------
    // NOTE: This just stores in localStorage the names of
    // items that we have captured, since there is no way
    // to just "pull" them individually.

    function SavedItems() {
        var savedValue = window.localStorage.getItem(SavedItems.STORAGEKEY);
        this.items = (savedValue ? JSON.parse(savedValue) : {});
    }

    SavedItems.STORAGEKEY = 'saveditems';

    SavedItems.prototype = {
        add: function(id) {
            this.items[id] = true;
            this._store();
        },

        remove: function(id) {
            delete this.items[id];
            this._store();
        },

        _store: function() {
            window.localStorage.setItem(SavedItems.STORAGEKEY, JSON.stringify(this.items));
        }
    }


    // -----------
    //   States
    // -----------

    var apiURI = 'api/';
    var dynamicMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    var handlingLevel = null; // set later


    // ----------------------------------
    //   Switch Between Handling Levels
    // ----------------------------------

    var select = document.getElementById('offline-handling');
    handlingLevel = select.options[select.selectedIndex].value;
    select.addEventListener('change', function() {
        handlingLevel = select.options[select.selectedIndex].value;
    }, false);


    // ----------------------------------------------------
    //   Register a Handler for requests made to this api
    // ----------------------------------------------------

    var savedItems = new SavedItems();
    var cache = window.openDataCache();
    cache.offlineTransaction(function(tx) {
        tx.capture(apiURI, null, null, dynamicMethods);
        tx.commit();
    });


    // ----------------------------------------------------
    //   Register a Handler for requests made to this api
    // ----------------------------------------------------

    navigator.registerOfflineHandler(apiURI, interceptor, reviewer);

    function reviewer(request, response) { console.log('INSIDE REVIEWER with', request.method); // temp debug
        var handler = reviewer[request.method.toUpperCase()];
        if (handler) {
            handler(request, response);
            return;
        }
    }

    function interceptor(request, response) { console.log('INSIDE INTERCEPTOR with', request.method); // temp debug

        // Basic Handling
        if (handlingLevel === 'basic' && request.method.toUpperCase() !== 'GET') {
            alert('You are offline with basic handling. Readonly');
            response.setStatus(400, Http.Status[400]);
            response.send();
            return;
        }

        // Advnaced Handling
        var handler = interceptor[request.method.toUpperCase()];
        if (handler) {
            handler(request, response);
            return;
        }

        // Error
        response.setStatus(400, Http.Status[400]);
        response.send();

    }


    // ----------------------
    //   Generic Management
    // ----------------------

    function saveItem(request) {
        var obj = parseBoxObjectFromRequest(request.bodyText);
        cache.offlineTransaction(function(tx) {
            var key = apiURI+obj.id;
            savedItems.add(key);
            tx.capture(key, request.bodyText, request.headers['Content-Type'], dynamicMethods);
            tx.commit();
        });
    }

    function releaseItem(request) {
        var obj = parseBoxObjectFromRequest(request.bodyText);
        cache.offlineTransaction(function(tx) {
            var key = apiURI+obj.id;
            savedItems.remove(key);
            tx.release(key);
            tx.commit();
        });
    }


    // ------------------------
    //   CRUD / REST Handlers
    // ------------------------

    interceptor.GET = function(request, response) {
        var tx = cache.transactionSync();
        var arr = [];
        for (var key in savedItems.items) {
            try {
                var body = tx.cache.getItem(key).body; // FIXME: Private API, synchronous...
                var obj = parseBoxObjectFromRequest(body);
                arr.push(obj)
            } catch (e) {} // ignored
        }

        response.setStatus(200, Http.Status[200]);
        response.setResponseText(JSON.stringify(arr));
        response.send();
    }

    interceptor.POST = function(request, response) {
        saveItem(request);
        response.setStatus(201, Http.Status[201]);
        response.send();
    }

    interceptor.PUT = function(request, response) {
        saveItem(request, false);
        response.setStatus(200, Http.Status[200]);
        response.send();
    }

    interceptor.DELETE = function(request, response) {
        releaseItem(request);
        response.setStatus(200, Http.Status[200]);
        response.send();
    }


    // -------------
    //   Reviewers
    // -------------

    reviewer.GET = function(request, response) {
        var o = null;
        try { o = JSON.parse(response.bodyText); } catch (e) { console.log(response); return; }
        if (!o) return;

        // Locally cache each object from the server
        for (var i=0, len=o.length; i<len; ++i) {
            var obj = o[i];
            cache.offlineTransaction(function(tx) {
                var key = apiURI+obj.id;
                savedItems.add(key);
                var bodyText = 'data=' + encodeURIComponent(JSON.stringify(obj));
                tx.capture(key, bodyText, 'application/json', dynamicMethods);
                tx.commit();
            });
        }
    }

    reviewer.POST = reviewer.PUT = function(request, response) {
        if (response.statusCode < 400)
            saveItem(request);
    }

    reviewer.DELETE = function(request, response) {
        if (response.statusCode < 400)
            releaseItem(request);
    }


    // --------------------
    //   Helper Functions
    // --------------------
    // NOTE: This is doing the work that PHP does in the background.
    // This parses the query data into a hash table and decodes them.

    function parseQueryData(data) {
        data = data.replace(/\+/g, ' ');
        var hash = {};
        var chunks = data.split(/&/);
        for (var i=0, len=chunks.length; i<len; ++i) {
            var p = chunks[i].split(/=/);
            hash[decodeURIComponent(p[0])] = decodeURIComponent(p[1]);
        }

        return hash;
    }

    function parseBoxObjectFromRequest(data) {
        var hash = parseQueryData(data);
        return JSON.parse(hash.data);
    }

})();
