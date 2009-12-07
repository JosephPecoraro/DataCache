var LATENCY = 500;

context('Basics', function() {
    should('have public methods', function() {
        ok(window.openDataCache !== undefined, "window.openDataCache exists");
    });

    should('have constants', function() {
        ok(typeof DataCache.IDLE === 'number', "DataCache.IDLE exists");
        ok(typeof DataCache.READY === 'number', "DataCache.IDLE exists");
        ok(typeof DataCache.OBSOLETE === 'number', "DataCache.IDLE exists");
    });
});


context('Resolving Absolute URLs', function() {
    var resolve = CacheTransaction.prototype._resolveAbsoluteFromBase;
    var location = { href: 'http://example.com/foo/bar.txt', host: 'example.com' }

    should('resolve properly', function() {

        // Already Full
        ok(resolve(location, 'http://example.com/foo/bar.txt') === '/foo/bar.txt');
        ok(resolve(location, 'http://example.com/foo/bar/baz.txt') === '/foo/bar/baz.txt');

        // Absolute, from host
        ok(resolve(location, '/foo/bar.txt') === '/foo/bar.txt');
        ok(resolve(location, '/foo/bar/baz.txt') === '/foo/bar/baz.txt');

        // Relative from Current Directory
        ok(resolve(location, 'foo/bar.txt') === '/foo/foo/bar.txt');
        ok(resolve(location, 'foo/bar/baz.txt') === '/foo/foo/bar/baz.txt');

        // Relative with tricks
        ok(resolve(location, 'foo/../bar.txt') === '/foo/bar.txt');
        ok(resolve(location, 'foo/../bar/baz.txt') === '/foo/bar/baz.txt');
        ok(resolve(location, 'a/b/c/../../d/../../bar/baz.txt') === '/foo/bar/baz.txt');

        // Absolute + Relative attempt to go above host
        ok(resolve(location, '../../../bar.txt') === '/bar.txt');
        ok(resolve(location, '/../../../bar.txt') === '/bar.txt');

        // Strips the #hash fragment
        ok(resolve(location, 'foo/../bar.txt#hash') === '/foo/bar.txt');
        ok(resolve(location, 'http://example.com/foo/bar.txt#hash') === '/foo/bar.txt');

    });
});


context('Parsing Headers', function() {
    var parse = CacheTransaction.prototype.parseHeaders;
    var headersText = [
        'Date: Sun, 06 Dec 2009 05:19:04 GMT',     // typical data
        'Content-Encoding: gzip',                  // typical data
        'Content-Length: 3447',                    // typical data
        'Content-Type: text/html; charset=UTF-8',  // typical data
        'Cache-Control: private, max-age=0',       // typical data
        'X-Xss-Protection:   0',                   // ignore left pad after colon
        '  Server: gws',                           // ignore left pad
        '  ',                                      // ignore blank line
        'Expires: -2',                             // gets overwritten later on
        'Expires: -1'
    ].join("\n");

    should('create a nice object', function() {
        var obj = parse(headersText);
        ok(obj['Cache-Control'] === "private, max-age=0");
        ok(obj['Content-Encoding'] === "gzip");
        ok(obj['Content-Length'] === "3447");
        ok(obj['Content-Type'] === "text/html; charset=UTF-8");
        ok(obj['Date'] === "Sun, 06 Dec 2009 05:19:04 GMT");
        ok(obj['Expires'] === "-1");
        ok(obj['Server'] === "gws");
        ok(obj['X-Xss-Protection'] === "0");
    });
});


// Testing private code
context('DataCacheGroup/Host', function() {
    var cache = window.openDataCache();
    var version = cache.version;
    var group = cache.group;

    should('have window as the host', function() {
        equals(group.host.realHost, window, "window is host");
    });

    should('return most current for relativeCache', function() {
        var newCache = group.create();
        var newVersion = newCache.version;

        ok(cache.group === newCache.group, "Same Group");
        ok(version < newVersion, "Version are in the proper order");

        ok(group.effectiveCache !== newCache, "Effective is not Newest");
        ok(group.relevantCache  === newCache, "Relevant is Newest");
        group.remove(newCache);
        ok(group.effectiveCache === cache, "Effective is newest");
        ok(group.relevantCache  === cache, "Relevant is newest");
    });

    should('not be not be obsolete', function() {
        equals(group.obsolete, false, "Not obsolete");
    });
});


context('DataCache', function() {
    should('be the same', function() {
        ok(window.openDataCache() === window.openDataCache(), 'Same returned');
    });
});


context('Offline Transaction', function() {
    var eventFlag = false;
    var eventCache = null;
    var callbackFlag = false;

    should('trigger off-line-updating event', function() {
        stop();
        window.addEventListener('off-line-updating', function handler(c) {
            window.removeEventListener('off-line-updating', handler, false);
            eventFlag = true;
            eventCache = c;
        }, false);

        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            callbackFlag = true;
        });

        setTimeout(function() {
            ok(eventFlag, "did fire");
            ok(eventCache !== cache, "new cache");
            ok(callbackFlag, "did fire");
            start();
        }); // no latency needed, these are all queued setTimeouts
    });
});


context('Offline Capture', function() {
    should('capture and manage a resource', function() {
        stop();
        var body = 'Hello, World!';
        var uri = 'blah.html';

        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            tx.capture(uri, body, 'text/plain', ['GET']);
        });

        function verify() {
            cache.swapCache();
            return window.openDataCache().managed[uri].body;
        }

        setTimeout(function() {
            ok(verify() === body);
            start();
        }, LATENCY);
    });
});


context('Online Transaction', function() {
    var uri = 'data.txt';
    var asyncData = null;
    var syncData = null;

    should('work asynchronously', function() {
        stop();
        var cache = window.openDataCache();
        var txCache = null;
        cache.transaction(function(tx) {
            tx.capture(uri);
            txCache = tx.cache;
        });
        setTimeout(function() {
            ok(txCache.managed[uri].body === 'Hello, World!');
            start();
        }, LATENCY);
    });

    should('work synchronously', function() {
        stop();
        var cache = window.openDataCache();
        var tx = cache.transactionSync();
        tx.capture(uri);
        setTimeout(function() {
            ok(tx.cache.managed[uri].body === 'Hello, World!');
            start();
        }, LATENCY);
    });
});


context('Online Transaction with 4xx or 5xx error', function() {
    var uri = 'code.php?code=500';
    var firedErrorEvent = false;

    should('fire error event', function() {
        stop();

        window.addEventListener('error', function handler(c) {
            window.removeEventListener('error', handler, false);
            firedErrorEvent = true;
        }, false);

        var cache = window.openDataCache();
        cache.transaction(function(tx) {
            tx.capture(uri);
        });

        setTimeout(function() {
            ok(firedErrorEvent, "did fire");
            start();
        }, LATENCY);
    });
});


context('Online Transaction with 401', function() {
    var uri = 'code.php?code=401';
    var firedObsoleteEvent = false;
    var cache = window.openDataCache();

    should('make fire obsolete event and make obsolete', function() {
        stop();

        window.addEventListener('obsolete', function handler(c) {
            window.removeEventListener('obsolete', handler, false);
            firedObsoleteEvent = true;
        }, false);

        cache.transaction(function(tx) {
            tx.capture(uri);
        });

        setTimeout(function() {
            ok(firedObsoleteEvent, "did fire");
            ok(cache.group.status === DataCache.OBSOLETE, "group became obsolete");
            start();
        }, LATENCY);
    });
});
