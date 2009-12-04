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
        window.addEventListener('off-line-updating', function(c) {
            eventFlag = true;
            eventCache = c;
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

