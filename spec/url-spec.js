context('URL Parsing', function() {
    function tst(s) {
        var o = URL.parse(s);
        ok(o !== null)
    }

    should('successfully parse some URLs', function() {
        
        // basic
        tst("http://www.google.com");
        tst("http://www.google.com:80");
        tst("http://www.google.com:80/");
        tst("http://www.google.com:80/blah");
        tst("http://www.google.com:80/blah#ahh");
        tst("http://www.google.com:80/blah?a=b");
        tst("http://www.google.com:80/blah?a=b#ahh");
        tst("www.google.com:80/blah?a=b#ahh");

        // also desired
        tst("ftp://ftp.is.co.za/rfc/rfc1808.txt");
        tst("http://www.ietf.org/rfc/rfc2396.txt");
        tst("mailto:John.Doe@example.com");
        tst("telnet://192.0.2.16:80/");

    });

    should('have proper component values', function() {
        var o = URL.parse("http://www.google.com:80/blah?a=b#ahh");
        ok(o.scheme === 'http');
        ok(o.authority === 'www.google.com');
        ok(o.port === 80);
        ok(o.path === '/blah');
        ok(o.query === 'a=b');
        ok(o.fragment === 'ahh');
    });
});
