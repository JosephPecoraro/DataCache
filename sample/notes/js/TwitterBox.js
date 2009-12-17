/*
 * TwitterBox Object
 * Joseph Pecoraro
 */

// -----------
//   Helpers
// -----------

function bindFunc(func, thisObject) {
    var args = Array.prototype.slice.call(arguments, 2);
    return function() {
        return func.apply(thisObject, args.concat(Array.prototype.slice.call(arguments, 0)));
    };
}

function addClassName(elem, newClass) {
    var regex = new RegExp("\\b"+newClass+"\\b");
    if (!regex.test(elem.className))
        elem.className = elem.className + ' ' + newClass;
}

function removeClassName(elem, theClass) {
    var regex = new RegExp("\\b"+theClass+"\\b", 'g');
    elem.className = elem.className.replace(regex, '');
}


// --------------------------------------------------
//   EventQueue - all good names are already taken!
// --------------------------------------------------

function EventQueue() {
    this._eventTable = {};
}

EventQueue.prototype = {
    addEventListener: function(name, func) {
        if (!(name in this._eventTable))
            this._eventTable[name] = [];
        this._eventTable[name].push(func);
    },

    removeEventListener: function(name, func) {
        var list = this._eventTable[name];
        if (!list)
            return;

        var index = list.indexOf(func);
        if (index === -1)
            return;

        list.splice(index, 1);
    },

    dispatchEvent: function(name, thisObj) {
        var list = this._eventTable[name];
        if (!list)
            return;

        var args = Array.prototype.slice.call(arguments, 2);
        for (var i=0, len=list.length; i<len; ++i) {
            var ret = list[i].apply(thisObj, args);
            if (ret === false)
                return false;
        }

        return true;
    }
}


// ---------------------------
//   TwitterBox - box object
// ---------------------------
//
//  Event Types:
//    'deleted' - when a TwitterBox is deleted
//    'updated' - when the user has made an editing change
//
//  Public API: (always triggers update)
//    setXYZ(x,y,z) - sets the position on the screen
//    setText(txt)  - sets the text
//

function TwitterBox(id, x, y, z, timestamp, content) {

    // Parent
    EventQueue.call(this);

    // Required
    this.id = id;
    this.x = x;
    this.y = y;
    this.z = z;

    // Optional
    this.timestamp = timestamp || +new Date;
    content = content || '...';

    // UI listeners
    this.rawdblclick = bindFunc(this.dblclick, this);
    this.rawmousedown = bindFunc(this.mousedown, this);

    // Generate the HTML and listeners for the box
    this.boxElement = document.createElement('div');
    this.boxElement.id = 'box-'+this.id;
    this.boxElement.className = 'box';
    this.boxElement.style.cssText = 'left:'+this.x+'px;top:'+this.y+'px;z-index:'+this.z;

    var ul = document.createElement('ul');
    append(ul, "\u2013", bindFunc(this.hide, this));
    append(ul, 'X', bindFunc(this.dispose, this));
    function append(ul, txt, handler) {
        var li = document.createElement('li');
        var span = document.createElement('span');
        span.appendChild(document.createTextNode(txt));
        span.onclick = handler;
        li.appendChild(span);
        ul.appendChild(li);
    }

    this.menubarElement = document.createElement('div');
    this.menubarElement.className = 'menubar';
    this.menubarElement.appendChild(ul);
    this.menubarElement.addEventListener('mousedown', this.rawmousedown, false);

    this.counterElement = document.createElement('span');
    this.counterElement.className = 'counter';

    this.bodyElement = document.createElement('p');
    this.bodyElement.appendChild(document.createTextNode(content));
    this.bodyElement.addEventListener('dblclick', this.rawdblclick, false);

    this.boxElement.appendChild(this.menubarElement);
    this.boxElement.appendChild(this.counterElement);
    this.boxElement.appendChild(this.bodyElement);
    document.getElementById('content').appendChild(this.boxElement);

    this.updateCount();
}

TwitterBox.prototype = {
    setXYZ: function(x, y, z) {
        this.x = x; this.y = y; this.z = z;
        this.boxElement.style.left = x+'px';
        this.boxElement.style.top = y+'px';
        this.boxElement.style.zIndex = z;
        this._updated();
    },

    setText: function(txt) {
        this.bodyElement.textContent = txt;
        this.updateCount();
        this._updated();
    },

    hide: function() {
        var li = this.menubarElement.firstChild.firstChild.firstChild; // div > ul > li > span[0]
        if (li.textContent === "\u2013") {
            this.boxElement.style.opacity = '0.5';
            li.textContent = '+';
        } else {
            this.boxElement.style.opacity = '1';
            li.textContent = "\u2013";
        }
    },

    dispose: function() {
        this._deleted();
        this.boxElement.parentNode.removeChild(this.boxElement);
    },

    updateCount: function() {
        var length = this.bodyElement.textContent.length;
        this.counterElement.textContent = (140-length);
    },

    toJSONObject: function() {
        return {
            id: this.id,
            timestamp: this.timestamp,
            content: this.bodyElement.textContent,
            x: this.x,
            y: this.y,
            z: this.z
        };
    },

    toJSONString: function() {
        return JSON.stringify(this.toJSONObject());
    },

    _sendData: function(method, page) {
        this.timestamp = +new Date;
        var xhr = new XMLHttpRequest();
        xhr.open(method, page, true);
        var data = 'data=' + encodeURIComponent(this.toJSONString());
        xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
        xhr.onload = function() { console.log('success', xhr, xhr.responseText); }
        xhr.onerror = function() { console.log('error', xhr, xhr.responseText); }
        xhr.send(data);
    },

    _created: function() {
        console.log('_created');
        this._sendData('POST', 'api/');
    },

    _deleted: function() {
        console.log('_deleted');
        this._sendData('DELETE', 'api/');
        this.dispatchEvent('deleted', null, this.toJSONObject());
    },

    _updated: function() {
        console.log('_updated');
        this._sendData('PUT', 'api/');
        this.dispatchEvent('updated', null, this.toJSONObject());
    },

    mousedown: function(event) {
        var self = this;
        var elem = event.target;
        var startX = event.clientX;
        var startY = event.clientY;
        addClassName(document.body, 'moving');
        document.addEventListener('mousemove', move, false);
        document.addEventListener('mouseup', release, false);

        this.z = TwitterBox.nextZ++;
        this.boxElement.style.zIndex = this.z;

        function move(event) {
            var offsetX = event.clientX - startX;
            var offsetY = event.clientY - startY;
            self.boxElement.style.left = (self.x+offsetX)+'px';
            self.boxElement.style.top = (self.y+offsetY)+'px';
        }

        function release(event) {
            document.removeEventListener('mousemove', move, false);
            document.removeEventListener('mouseup', release, false);
            removeClassName(document.body, 'moving');
            var offsetX = event.clientX - startX;
            var offsetY = event.clientY - startY;
            self.x = (self.x+offsetX);
            self.y = (self.y+offsetY);
            self._updated();
        }
    },

    dblclick: function(event) {
        var elem = event.target;
        if (elem.contentEditable === 'true')
            return;

        // ---------
        //   setup
        // ---------

        var self = this;
        var oldText = elem.textContent;
        addClassName(elem, 'editing');
        elem.contentEditable = 'true';
        elem.addEventListener('keydown', keydownHandler, false);
        elem.addEventListener('keyup', keyupHandler, false);
        elem.addEventListener('blur', blurHandler, false);

        // ------------------
        //   event handlers
        // ------------------

        function keydownHandler(event) {
            switch (event.keyCode) {
                case 13: // Enter
                    event.preventDefault();
                    event.stopPropagation();
                    commit();
                    break;
                case 27: // Esc
                    event.preventDefault();
                    event.stopPropagation();
                    cancel();
                    break;
            }
        }

        function keyupHandler(event) {
            self.updateCount();
        }

        function blurHandler(event) {
            if (self.bodyElement.textContent === oldText)
                cancel();
            else
                commit();
        }

        // --------------
        //   finalizers
        // --------------

        function cleanup() {
            removeClassName(elem, 'editing');
            elem.contentEditable = 'false';
            elem.removeEventListener('keydown', keydownHandler, false);
            elem.removeEventListener('keyup', keyupHandler, false);
            elem.removeEventListener('blur', blurHandler, false);
            elem.blur();
            self.updateCount();
        }

        function commit() {
            cleanup();
            self._updated();
        }

        function cancel() {
            elem.textContent = oldText;
            cleanup();
        }
    }
}

TwitterBox.prototype.__proto__ = EventQueue.prototype;

// ----------------------
//   TwitterBox Factory
// ----------------------

TwitterBox.height = 90;
TwitterBox.shift = 20;
TwitterBox.nextId = 0;
TwitterBox.lastX = 200;
TwitterBox.lastY = 20;
TwitterBox.nextX = 220;
TwitterBox.nextY = 40;
TwitterBox.nextZ = 0;

TwitterBox.createBox = function() {
    var box = new TwitterBox(TwitterBox.nextId++, TwitterBox.lastX, TwitterBox.lastY, TwitterBox.nextZ++);
    if (TwitterBox.lastY >= 350) {
        TwitterBox.lastX = TwitterBox.nextX;
        TwitterBox.lastY = TwitterBox.nextY;
        TwitterBox.nextX += 20;
        TwitterBox.nextY += 20;
    } else {
        TwitterBox.lastX += TwitterBox.shift;
        TwitterBox.lastY += TwitterBox.height;
    }

    box._created();
    return box;
}

TwitterBox.fromJSON = function(o) {
    o.timestamp = parseInt(o.timestamp);
    o.id = parseInt(o.id);
    o.x = parseInt(o.x);
    o.y = parseInt(o.y);
    o.z = parseInt(o.z);

    if (o.id >= TwitterBox.nextId)
        TwitterBox.nextId = o.id+1;
    if (o.z >= TwitterBox.nextZ)
        TwitterBox.nextZ = o.z+1;
    return new TwitterBox(o.id, o.x, o.y, o.z, o.timestamp, o.content);
}


// --------------
//   Load State
// --------------

window.addEventListener('load', function() {

    // Load JSON from state.php
    // and turn into objects.
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'api/');
    xhr.onerror = function() { console.log('failed', xhr); } // to be intercepted.
    xhr.onload = function() {
        var o = JSON.parse(xhr.responseText);
        if (!o)
            return;

        for (var i=0, len=o.length; i<len; ++i)
            TwitterBox.fromJSON(o[i]);
    }
    xhr.send();

}, false);
