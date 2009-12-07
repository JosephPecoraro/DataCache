/*
 * DataCache API
 * Joseph Pecoraro
 */


// ---------------------------
//   Object Oriented Helpers
// ---------------------------

// Valid for WebKit and Firefox, the supported browsers
function subclass(child, parent) {
    child.prototype.__proto__ = parent.prototype;
}

// Deep copy an object
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}


// -------------
//   DataCache
// -------------

function DataCache(group, origin, version) {
    this.group = group;
    this.origin = origin;
    this.completeness = 'incomplete';
    this.version = version || 0;

    this.managed = {};
}

DataCache.IDLE = 0;
DataCache.READY = 1;
DataCache.OBSOLETE = 2;
DataCache.UPDATING = 3; // Hidden (non-standard)

DataCache.prototype = {
    get requiredCookie() {
        return undefined;
    },

    _createCacheTransaction: function(group, offline) {
        if (group.obsolete)
            throw 'DataCache: Cache Group is obsolete.';

        if (!offline) {
            if (group.status === DataCache.UPDATING)
                throw 'DataCache: a cache transaction is already open on this data cache group.';
            group.status = DataCache.UPDATING;
        }

        if (offline) {
            var newCache = group.create();
            var tx = new OfflineTransaction(newCache);
            this.queueCacheEvent('off-line-updating');
            return tx;
        } else {
            var newCache = group.createLikeRelevant();
            var tx = new OnlineTransaction(newCache);
            this.queueCacheEvent('updating');
            return tx;
        }
    },

    queueCacheEvent: function(type) {
        this.group.host.queueTask(type, this);
    },

    _handleTransaction: function(transaction, callback, errorCallback) {
        if (callback) {
            var host = this.group.host;
            setTimeout(function(tx) {
                try { callback.call(host, tx); }
                catch (e) {
                    setTimeout(function() {
                        errorCallback.call(host);
                    }, 0);
                }
            }, 0, transaction);
        }
    },

    transaction: function(callback, errorCallback) {
        var tx = this._createCacheTransaction(this.group, false);
        this._handleTransaction(tx, callback, errorCallback);
    },

    offlineTransaction: function(callback, errorCallback) {
        var tx = this._createCacheTransaction(this.group, true);
        this._handleTransaction(tx, callback, errorCallback);
    },

    transactionSync: function() {
        return this._createCacheTransaction(this.group, false);
    },

    swapCache: function() {
        this.group.effectiveCache = this.group.relevantCache;
        // FIXME: so what?
    },

    eachModificationSince: function(version, callback, successCallback) {

    },

    manage: function(uri, resource) {
        this.managed[uri] = resource;
    }
};


// --------------------------------
//   CacheTransaction (Interface)
// --------------------------------

function CacheTransaction(cache) {
    this.cache = cache;
    this.status = CacheTransaction.PENDING;
    this.oncommitted = function() {};
}

CacheTransaction.prototype = {
    getItem: function(uri, callback) {

    },

    release: function(uri) {

    },

    commit: function() {

    },

    _capture: function(uri, host, tx, methods, content, contentType) {
        if (tx.status !== CacheTransaction.PENDING)
            throw "CacheTransaction: can only capture a PENDING transaction";

        var baseURI = host.realHost.location.host; // NOTE: this is always the window
        var absoluteURI = this._resolveAbsoluteFromBase(host.realHost.location, uri);

        // TODO: Error checking on the URI
        // FIXME: ^^

        var cache = tx.cache;
        delete cache.managed[absoluteURI];
        this._captureSubsteps(uri, methods, content, contentType);
    },

    _resolveAbsoluteFromBase: function(location, uri) {

        // Remove scheme if it exists
        function stripScheme(s) {
            return (s.match(/^.*?:\/\//) ? s.substring(s.indexOf('://')+3) : s);
        }

        // Remove host if it exists
        function stripHost(s) {
            return (s.indexOf(host) === 0 ? s.substring(host.length) : s);
        }

        // on page: http://example.com/foo/bar.txt
        //   host       => example.com
        //   currentDir => example.com/foo/
        var host = location.host;
        var currentDir = location.href.substring(0, location.href.lastIndexOf('/')+1);
        currentDir = stripHost(stripScheme(currentDir));
        uri = stripHost(stripScheme(uri));

        //  The result may start with an absolute path from the root
        //  or a relative path from the current directory
        var str = '';
        if (uri.charAt(0) === '/')
            uri = uri.substring(1);
        else {
            if (currentDir.charAt(currentDir.length-1) == '/')
                str = currentDir.substring(0, currentDir.length-1);
            else
                str = currentDir; // This case is not tested... location.href doesn't end in a slash? can browsers do this?
        }

        // Handle remaining sections
        //   .. means move up a directory
        //   anything else means append a new directory/part
        var parts = uri.split('/');
        for (var i=0, len=parts.length; i<len; ++i) {
            var part = parts[i];
            if (part.length === 0)
                continue;

            switch (part) {
                case '..':
                    str = str.substring(0, str.lastIndexOf('/'));
                    break;
                default:
                    str += '/' + part;
                    break;
            }
        }

        // Return absolute representation
        return str;
    },

    parseHeaders: function(headersText) {
        if (!headersText)
            return {};

        // Remove leading whitespace
        function trimLeft(s) {
            return s.replace(/^\s+/, '');
        }

        // Convert HTTP key/value pairs into a hash
        var headers = {};
        var lines = headersText.split(/\n/);
        for (var i=0, len=lines.length; i<len; ++i) {
            var line = trimLeft(lines[i]);
            var colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
                var key = line.substring(0, colonIndex);
                var value = trimLeft(line.substring(colonIndex+1));
                headers[key] = value;
            }
        }

        return headers;
    }
};

CacheTransaction.PENDING   = 0;
CacheTransaction.COMMITTED = 1;
CacheTransaction.ABORTED   = 2;


// ---------------------
//   OnlineTransaction
// ---------------------

function OnlineTransaction(cache) {
    CacheTransaction.call(this, cache);
}

OnlineTransaction.prototype = {
    get offline() {
        return false;
    },

    capture: function(uri, dynamicMethods) {
        this._capture(uri, this.cache.group.host, this, dynamicMethods);
    },

    abort: function() {
        if (this.status !== CacheTransaction.PENDING)
            throw 'CacheTransaction: cannot abort a non-PENDING transaction';
        this.cache.group.remove(this.cache);
        this.status = CacheTransaction.ABORT;
        this.cache.queueCacheEvent('error');
    },

    _captureSubsteps: function(uri, methods) {
        this.cache.group.host.queueTask('fetching', this.cache, uri);

        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open("GET", uri); // asynchronous
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200 || xhr.status === 0)
                    self._captureSuccess(xhr, uri, methods);
                else
                    self._captureFailure(xhr);
            }
        }
        xhr.send();

        var item = new CacheItem(CacheItem.FETCHING);
        this.cache.manage(uri, item);
    },

    _captureSuccess: function(xhr, uri, methods) {
        console.log('success', xhr);
        var body = xhr.responseText; // FIXME: binary?
        var type = xhr.getResponseHeader('Content-Type'); // FIXME: determine from filetype as well?
        var headers = this.parseHeaders(xhr.getAllResponseHeaders());
        var item = new CacheItem(CacheItem.CACHED, body, type, methods, headers);
        this.cache.manage(uri, item);
        this.cache.group.host.queueTask('captured');
    },

    _captureFailure: function(xhr) {
        console.log('failure', xhr);
    }
}

subclass(OnlineTransaction, CacheTransaction);


// ----------------------
//   OfflineTransaction
// ----------------------

function OfflineTransaction(cache) {
    CacheTransaction.call(this, cache);
}

OfflineTransaction.prototype = {
    get offline() {
        return true;
    },

    capture: function(uri, body, contentType, dynamicMethods) {
        this._capture(uri, this.cache.group.host, this, dynamicMethods, body, contentType);
    },

    _captureSubsteps: function(uri, methods, content, contentType) {
        var item = new CacheItem(CacheItem.CACHED, content, contentType, methods);
        this.cache.manage(uri, item);
        this.cache.group.host.queueTask('captured', this.cache, uri);
    }
}

subclass(OfflineTransaction, CacheTransaction);


// -------------
//   CacheItem
// -------------

function CacheItem(readyState, body, type, dynamicMethods, headers) {
    this.readyState = readyState;
    this.body = body;
    this.type = (type || 'text/plain');
    this.dynamicMethods = dynamicMethods;
    this.headers = (headers || {});
}

CacheItem.UNCACHED = 0;
CacheItem.FETCHING = 1;
CacheItem.CACHED = 2;
CacheItem.GONE = 3;


// -----------------------
//   CacheEvent (unused)
// -----------------------

function CacheEvent() {
    this.cache = null;
    this.uri = null;
}

CacheEvent.prototype = {
    __proto__: Event.prototype
}; // semicolon is required


// -------------------------------------
//   Override Default Browser Behavior
// -------------------------------------

(function() {

    // Create Event should recognize CacheEvent
    var _createEvent = document.createEvent;
    document.createEvent = function(type) {
        switch (type) {
            case "CacheEvent":
                return _createEvent.call(document, 'Event'); // for compatibility this must be "Event"
            default:
                return _createEvent.apply(document, arguments);
        }
    }

    Event.prototype.initCacheEvent = function(cache, uri) {
        this.cache = cache;
        this.uri = uri;
    };

    Event.prototype.initCacheEventNS = function(namespaceURI, cache, uri) {
        // FIXME: namespace is ignored
        this.initCacheEvent(cache, uri);
    }

})();



(function() {

    // ------------------------------------------
    //   DataCacheHost (private) (non-standard)
    // ------------------------------------------

    function DataCacheHost(realHost) {
        this.realHost = realHost; // always window for this library
    }

    DataCacheHost.prototype = {
        queueTask: function(type, cache, uri) {
            var event = document.createEvent('CacheEvent');
            event.initEvent(type, false, false);
            event.initCacheEvent(cache, uri);
            this.realHost.dispatchEvent(event);
        }
    }

    // -------------------------------------------
    //   DataCacheGroup (private) (non-standard)
    // -------------------------------------------

    function DataCacheGroup(host, origin) {
        this.host = host;
        this.origin = origin;
        this.status = DataCache.IDLE;
        this.versions = {};
        this._nextVersion = 0;
        this._effectiveCache = null;
    }

    DataCacheGroup.prototype = {
        get obsolete() {
            return this.status === DataCache.OBSOLETE;
        },

        get relevantCache() {
            var highestVersion = this._nextVersion - 1;
            while (highestVersion >= 0) {
                if (highestVersion in this.versions)
                    return this.versions[highestVersion];
                highestVersion--;
            }

            return this.create();
        },

        get effectiveCache() {
            if (!this._effectiveCache)
                this._effectiveCache = this.relevantCache;

            return this._effectiveCache;
        },

        set effectiveCache(x) {
            this._effectiveCache = x;
        },

        add: function(cache) {
            if (!cache)
                throw 'DataCache: you may only add a valid cache to a cache group.';

            this.versions[cache.version] = cache;
        },

        create: function() {
            var cache = new DataCache(this, this.origin, this._nextVersion);
            this._nextVersion++;
            this.add(cache);
            this.status = DataCache.IDLE;
            DataCacheGroupController.save(this);
            return cache;
        },

        createLikeRelevant: function() {
            var relevant = this.relevantCache;
            var cache = this.create();
            cache.managed = deepCopy(relevant.managed);
            return cache;
        },

        remove: function(cache) {
            if (cache.group !== this || this.versions[cache.version] !== cache)
                return;

            delete this.versions[cache.version];
            if (this._effectiveCache === cache)
                this._effectiveCache = null; // NOTE: will become relevant cache
        },

        update: function(cache) {
            var oldVersion = cache.version;
            var newVersion = this._nextVersion;
            cache.version = newVersion;
            delete this.versions[oldVersion];
            this.versions[newVersion] = cache;
            this._nextVersion++;
        },

        eachModificationFromTo: function(highVersion, lowVersion, callback, successCallback) {
            var additions = [];
            var removals = [];

            var currentCache = this.versions[highVersion];
            // need to know what was added/removed (readyState)

            var olderCache = this._nextLowerCache(highVersion);
            while (olderCache) {
                // need to know what was added/removed (readyState)
                olderCache = this._nextLowerCache(olderCache.version);
            }

            if (callback) {
                for (var i=0, len=additions.length; i<len; ++i)
                    setTimeout(callback, 0, additions[i], 'addition');
                for (var i=0, len=additions.length; i<len; ++i)
                    setTimeout(callback, 0, additions[i], 'removal');
            }

            if (successCallback)
                successCallback.call(this);
        },

        _nextLowerCache: function(version) {
            for (var i=(version-1); i>0; --i) {
                if (this.versions[i])
                    return this.versions[i];
            }

            return null;
        }
    }


    // --------------------------------------------
    //   DataCacheGroupController (save-and-load)
    // --------------------------------------------

    DataCacheGroupController = {
        key: 'datacachegroup',

        load: function() {
            var jsonString = window.localStorage[DataCacheGroupController.key];
            if (!jsonString)
                return;

            // TODO: Handle managed resources
            var savedObj = JSON.parse(jsonString);
            var host = this._createDataCacheHost();
            var group = this._createDataCacheGroup(host, window.location.host);
            for (var i in savedObj.v) {
                var v = savedObj.v[i];
                group.versions[i] = this._createDataCache(group, v.origin, v.version, v.completeness);
            }

            return group;
        },

        save: function(group) {
            // TODO: Handle managed resources
            var savedObj = { _nextVersion: group._nextVersion, v: {} };
            for (var i in group.versions) {
                var version = group.versions[i];
                savedObj.v[i] = {
                    origin: version.origin,
                    completeness: version.completeness,
                    version: version.version
                };
            }

            var jsonString = JSON.stringify(savedObj);
            // FIXME: reenable later one
            // window.localStorage[DataCacheGroupController.key] = jsonString;
        },

        _createDataCache: function(group, origin, version, completeness) {
            var cache = new DataCache(group, origin, version);
            cache.completeness = completeness;
            return cache;
        },

        _createDataCacheHost: function() {
            return new DataCacheHost(window);
        },

        _createDataCacheGroup: function(host, origin) {
            return new DataCacheGroup(host, origin);
        }
    }


    // ---------------------
    //   Setup Information
    // ---------------------
    var origin = window.location.host;
    var host = new DataCacheHost(window);


    // -----------------------
    //   Load DataCacheGroup
    // -----------------------
    var group = DataCacheGroupController.load();
    if (!group)
        group = new DataCacheGroup(host, origin);


    // ---------------
    //   Public APIs
    // ---------------

    window.openDataCache = function openDataCache(cookieName) {
        var isSecure = (typeof cookieName !== 'undefined');
        if (isSecure)
            throw 'DataCache: The JavaScript Library cannot reliably handle secure DataCaches';

        return group.effectiveCache;
    }

})();




/*
 * Overwrite Default XMLHttpRequest behavior through
 * monkey patching, to sneak information?
 */

// -------------------------------
//   InterceptableXMLHttpRequest
// -------------------------------

function InterceptableXMLHttpRequest() {

    // Internal request
    var xhr = this.xhr = new XMLHttpRequest();

    // Generate functions with non-closured values
    function genericApply(func) { return function() { return xhr[func].apply(xhr, arguments); } };
    function createGetter(func) { return function() { return xhr[func]; } };
    function createSetter(func) { return function(handler) { xhr[func] = handler; } };

    // Pass through Interface, with the exception of some
    // NOTE: Getters / Setters need special handling
    var exceptions = ['open'];
    var getters = ['status', 'readyState', 'responseXML', 'responseText', 'statusText'];

    for (var func in this.xhr) {
        if (exceptions.indexOf(func) === -1) {
            if (getters.indexOf(func) !== -1 || func.indexOf("on") === 0) {
                this.__defineGetter__(func, createGetter(func));
                this.__defineSetter__(func, createSetter(func));
            } else {
                this[func] = genericApply(func);
            }
        }
    }

};

InterceptableXMLHttpRequest.prototype = {
    open: function() {
        this.xhr.open.apply(this.xhr, arguments);
    }
}


