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

    // Add to the table
    TwitterBox.table[id] = this;

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

    setText: function(txt, avoidUpdate) {
        this.bodyElement.textContent = txt;
        this.updateCount();
        if (!avoidUpdate)
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

    dispose: function(avoidUpdate) {
        if (!avoidUpdate)
            this._deleted();
        this.boxElement.parentNode.removeChild(this.boxElement);
        delete TwitterBox.table[this.id];
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
        this.timestamp = Date.now();
        var xhr = new XMLHttpRequest();
        xhr.open(method, page, true);
        var data = 'data=' + encodeURIComponent(this.toJSONString());
        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
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
        this._sendData('DELETE', 'api/'+this.id);
        this.dispatchEvent('deleted', null, this.toJSONObject());
    },

    _updated: function() {
        console.log('_updated');
        this._sendData('PUT', 'api/'+this.id);
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
    },

    animationFor: function(o) {
        var x = o.x;
        var y = o.y;
        if (this.x !== x || this.y !== y) {
            var style = this.boxElement.style;
            return {
                element: this.boxElement,
                start: { left: this.x, top: this.y },
                end: { left: x, top: y }
            };
        }

        return null;
    },

    updateFromJSON: function(o) {
        // NOTE: we don't actually move
        this.x = o.x;
        this.y = o.y;
        this.z = o.z;
        this.timestamp = o.timestamp;
        this.setText(o.content, true);
    }
}

TwitterBox.prototype.__proto__ = EventQueue.prototype;


// ----------------------
//   TwitterBox Factory
// ----------------------

TwitterBox.table = {};
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
    if (o.id >= TwitterBox.nextId)
        TwitterBox.nextId = o.id+1;
    if (o.z >= TwitterBox.nextZ)
        TwitterBox.nextZ = o.z+1;
    return new TwitterBox(o.id, o.x, o.y, o.z, o.timestamp, o.content);
}


// ----------------------
//   TwitterBox Loader
// ----------------------

TwitterBox.Pull = function() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'api/');
    xhr.onerror = function() { console.log('failed', xhr); } // to be intercepted.
    xhr.onload = process;
    xhr.send();

    function process() {
        var json = JSON.parse(xhr.responseText);
        if (!json)
            return;

        var animations = [];
        var boxes = document.querySelectorAll('.box');

        // Create New Boxes and Animating Existing Boxes
        for (var i=0, len=json.length; i<len; ++i) {

            var o = json[i];
            o.timestamp = parseInt(o.timestamp);
            o.id = parseInt(o.id);
            o.x = parseInt(o.x);
            o.y = parseInt(o.y);
            o.z = parseInt(o.z);

            var existingBox = TwitterBox.table[o.id];
            if (!existingBox)
                TwitterBox.fromJSON(o);
            else {
                var animation = existingBox.animationFor(o);
                if (animation)
                    animations.push(animation);
                existingBox.updateFromJSON(o);
                existingBox.boxElement.handled = true;
            }
        }

        // Start the animation
        if (animations.length > 0)
            TwitterBox.animate(animations, 500);

        // Take care of any of the Boxes that were deleted (non-handled)
        for (var i=0, len=boxes.length; i<len; ++i) {
            var boxElement = boxes[i];
            if (boxElement.handled)
                delete boxElement.handled;
            else
                TwitterBox.table[parseInt(boxElement.id.substring(4))].dispose(true);
        }
    }
}


// ---------------------
//   Generic Animation
// ---------------------
// Attribution: This is a modified version of the code from the WebKit Open
// Source Project (specifically from the Web Inspector). I have contributed to
// that project, including specifically modifying the function below.
//
// Sample Usage:
//
//   var animations = [
//       {element: document.getElementById('one'), start: {height:1}, end: {height:200}},
//       {element: document.getElementById('two'), start: {bottom:1}, end: {bottom:200}}
//   ];
//
//   TwitterBox.animate(animations, 1000);

TwitterBox.animate = function(animations, duration, callback) {

    var interval;
    var complete = 0;
    var defaultUnit = 'px';
    var propertyUnit = { opacity: '' };
    var animationsLength = animations.length;
    var intervalDuration = (1000/30); // 30 frames per second.

    function cubicInOut(t, b, c, d) {
        if ((t/=d/2) < 1) return c/2*t*t*t + b;
        return c/2*((t-=2)*t*t + 2) + b;
    }

    for (var i=0; i<animationsLength; ++i) {
        var a = animations[i];
        for (var key in a.start)
            a.start[key] = parseInt(a.start[key]);
        for (var key in a.end)
            a.end[key] = parseInt(a.end[key]);
    }

    function animateLoop() {
        complete += intervalDuration;
        var next = complete + intervalDuration;

        for (var i=0; i < animationsLength; ++i) {
            var animation = animations[i];
            var element = animation.element;
            var start = animation.start;
            var end = animation.end;
            if (!element)
                continue;

            var style = element.style;
            for (var key in end) {
                var endValue = end[key];
                if (next < duration) {
                    var startValue = start[key];
                    var newValue = cubicInOut(complete, startValue, endValue - startValue, duration);
                    style[key] = newValue + (key in propertyUnit ? propertyUnit[key] : defaultUnit);
                } else
                    style[key] = endValue + (key in propertyUnit ? propertyUnit[key] : defaultUnit);
            }
        }

        if (complete >= duration) {
            clearInterval(interval);
            if (callback)
                callback();
        }
    }

    interval = setInterval(animateLoop, intervalDuration);
    animateLoop();
}


// --------------
//   Load State
// --------------

window.addEventListener('load', TwitterBox.Pull, false);
