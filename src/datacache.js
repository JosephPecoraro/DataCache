/*
 * DataCache API
 * Joseph Pecoraro
 */


// -------------
//   DataCache
// -------------

function DataCache(group, origin, version) {
    this._group = group;
    this._origin = origin;
    this._completeness = 'incomplete';
    this._version = version || 0;
}

DataCache.IDLE = 0;
DataCache.READY = 1;
DataCache.OBSOLETE = 2;
DataCache.UPDATING = 3; // Hidden (non-standard)

DataCache.prototype = {
    get requiredCookie() {
        return undefined;
    },

    get version() {
        return this._version;
    },

    get group() {
        return this._group;
    },

    _createCacheTransaction: function(group, offline) {
        if (group.obsolete)
            throw 'DataCache: Cache Group is obsolete.';

        if (!offline) {
            if (group.status === DataCache.UPDATING)
                throw 'DataCache: a cache transaction is already open on this data cache group.';
            group.status = DataCache.UPDATING;
        }

        var newCache = group.create();
        if (offline) {
            var tx = new OfflineTransaction(newCache);
            this.queueCacheEvent('off-line-updating');
            return tx;
        } else {
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

    swapCache: function() {
        this.group.effectiveCache = this.group.relevantCache;
        // FIXME: so what?
    },

    eachModificationSince: function(version, callback, successCallback) {

    }
};


// --------------------------------
//   CacheTransaction (Interface)
// --------------------------------

function CacheTransaction(cache) {
    this.cache = cache;
    this.status = CacheTransaction.PENDING;
    this.oncommitted = function() {};
    this.managed = {};
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
        var absoluteURI = this._resolveAbsoluteFromBase(baseURI, uri);

        // TODO: Error checking on the URI

        var cache = tx.cache;
        delete this.managed[absoluteURI];
        this._captureSubsteps();
    },

    _resolveAbsoluteFromBase: function(base, uri) {
        // FIXME: needs a generic algorithm
        return uri.replace(base, '');
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
    __proto__: CacheTransaction,

    get offline() {
        return false;
    },

    capture: function(uri, dynamicMethods) {
        this._capture(uri, this.host, this, dynamicMethods);
    },

    abort: function() {
        if (this.status !== CacheTransaction.PENDING)
            throw 'CacheTransaction: cannot abort a non-PENDING transaction';
        this.cache.group.remove(this.cache);
        this.status = CacheTransaction.ABORT;
        this.cache.queueCacheEvent('error');
    },

    _captureSubsteps: function() {

    }
}


// ----------------------
//   OfflineTransaction
// ----------------------

function OfflineTransaction(cache) {
    CacheTransaction.call(this, cache);
}

OfflineTransaction.prototype = {
    __proto__: CacheTransaction,

    get offline() {
        return true;
    },

    capture: function(uri, body, contentType, dynamicMethods) {
        this._capture(uri, this.host, this, dynamicMethods, body, contentType);
    },

    _captureSubsteps: function(uri, methods, content, contentType) {
        this.cache.manage(uri, methods, {
            representation: content,
            type: (contentType || 'text/plain')
        });
        // queue event "captured"
    }
}


// -------------
//   CacheItem
// -------------

function CacheItem(readyState, body, dynamicMethods, headers) {
    this.readyState = readyState;
    this.body = body;
    this.dynamicMethods = dynamicMethods;
    this.headers = headers;
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
            return cache;
        },

        remove: function(cache) {
            if (cache.group !== this || this.versions[cache.version] !== cache)
                return;

            delete this.versions[cache.version];
            if (this._effectiveCache === cache)
                this._effectiveCache = null; // NOTE: will become relevant cache
        }
    }

    // FIXME: Implement (load and save to storage)
    DataCacheGroupController = {
        load: function() {},
        save: function() {}
    };


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


