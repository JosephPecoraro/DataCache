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

    });
});


context('Parsing Headers', function() {
    var parse = CacheTransaction.prototype.parseHeaders;
    var headersText = [
        'Date: Sun, 06 Dec 2009 05:19:04 GMT',
        'Content-Encoding: gzip',
        'Content-Length: 3447',
        'Content-Type: text/html; charset=UTF-8',
        'Cache-Control: private, max-age=0',
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

        ok(group.effectiveCache !== newCache, "Effective is Last Newest");
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
        window.addEventListener('off-line-updating', function handler(c) {
            eventFlag = true;
            eventCache = c;
            window.removeEventListener('off-line-updating', handler);
        }, false);

        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            callbackFlag = true;
        });

        ok(eventFlag, "did fire");
        setTimeout(function() { ok(eventCache === cache, "correct cache"); });
        setTimeout(function() { ok(callbackFlag, "did fire"); });
    });
});


context('Offline Capture', function() {
    should('capture and manage a resource', function() {
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

        setTimeout(function() { ok(verify() === body); });
    });
});

