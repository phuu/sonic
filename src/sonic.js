/*
 * Sonic 0.3
 * --
 * https://github.com/phuu/sonic
 * --
 * Originally by James Padolsey: https://github.com/padolsey/Sonic
 *
 * This program is free software. It comes without any warranty, to
 * the extent permitted by applicable law. You can redistribute it
 * and/or modify it under the terms of the Do What The Fuck You Want
 * To Public License, Version 2, as published by Sam Hocevar. See
 * http://sam.zoy.org/wtfpl/COPYING for more details. */

(function(){

  var requestAnimationFrame = (function(){
    return  window.requestAnimationFrame       ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.oRequestAnimationFrame      ||
            window.msRequestAnimationFrame     ||
            function( callback ){
              window.setTimeout(callback, 1000 / 60);
            };
  })();

  var emptyFn = function(){};

  function Sonic(d) {

    this.data = d.path || d.data;

    this.multiplier = d.multiplier || 1;
    this.padding = d.padding || 0;

    this.fps = this.fps || 25;
    this.targetFps = 60;

    this.stepsPerFrame = d.stepsPerFrame || 1;
    this.trailLength = d.trailLength || 1;
    this.pointDistance = d.pointDistance || 0.05;
    this.time = d.time || false;

    this.domClass = d.domClass || 'sonic';

    this.fillColor = d.fillColor || '#FFF';
    this.strokeColor = d.strokeColor || '#FFF';
    this.dotRadius = d.dotRadius || 3;
    this.clearEveryFrame = true;
    if (d.clearEveryFrame !== undefined) {
      this.clearEveryFrame = d.clearEveryFrame;
    }
    this.clearOnReset = true;
    if (d.clearOnReset !== undefined) {
      this.clearOnReset = d.clearOnReset;
    }

    this.stepMethod = typeof d.step == 'string' ?
      stepMethods[d.step] :
      d.step || stepMethods.square;

    // Hooks
    this._setup = d.setup || emptyFn;
    this._prePlay = d.prePlay || emptyFn;
    this._preDraw = d.preDraw || emptyFn;
    this._preStep = d.preStep || emptyFn;
    this._postDraw = d._postDraw || emptyFn;
    this._complete = d.complete || emptyFn;

    this.width = d.width;
    this.height = d.height;

    this.fullWidth = this.width + 2*this.padding;
    this.fullHeight = this.height + 2*this.padding;

    this.domClass = d.domClass || 'sonic';

    this.setup();
    this._setup();

  }

  var argTypes = Sonic.argTypes = {
    DIM: 1,
    DEGREE: 2,
    RADIUS: 3,
    OTHER: 0
  };

  var argSignatures = Sonic.argSignatures = {
    arc: [1, 1, 3, 2, 2, 0],
    bezier: [1, 1, 1, 1, 1, 1, 1, 1],
    line: [1,1,1,1]
  };

  var pathMethods = Sonic.pathMethods = {
    bezier: function(t, p0x, p0y, p1x, p1y, c0x, c0y, c1x, c1y) {

      t = 1-t;

      var i = 1-t,
          x = t*t,
          y = i*i,
          a = x*t,
          b = 3 * x * i,
          c = 3 * t * y,
          d = y * i;

      return [
        a * p0x + b * c0x + c * c1x + d * p1x,
        a * p0y + b * c0y + c * c1y + d * p1y
      ];

    },
    arc: function(t, cx, cy, radius, start, end) {

      var point = (end - start) * t + start;

      var ret = [
        (Math.cos(point) * radius) + cx,
        (Math.sin(point) * radius) + cy
      ];

      ret.angle = point;
      ret.t = t;

      return ret;

    },
    line: function(t, sx, sy, ex, ey) {
      return [
        (ex - sx) * t + sx,
        (ey - sy) * t + sy
      ];
    }
  };

  var stepMethods = Sonic.stepMethods = {

    square: function(point, i, f) {
      this._.fillRect(point.x - 3, point.y - 3, 6, 6);
    },

    fader: function(point, i, f) {

      this._.beginPath();

      if (this._last) {
        this._.moveTo(this._last.x, this._last.y);
      }

      this._.lineTo(point.x, point.y);
      this._.closePath();
      this._.stroke();

      this._last = point;

    },

    timer: function(point, i, f) {

      // point is an object { x: n, y: n, progress: n, index: n }
      // point.progress is progress of point (0..1)
      // relative to other points in that single draw

      // i is relative to the drawn shape (the tail) (0..1)
      // f is the current frame (0..1)
      // pointIndex is the the point's overall index within the points array

      if (point.index < this.frame) {
        this._.globalAlpha = 1;
        this._.beginPath();
        this._.moveTo(point.x, point.y);
        this._.arc(point.x, point.y, this.dotRadius, 0, Math.PI*2, false);
        this._.closePath();
        this._.fill();
      }

    }

  };

  Sonic.prototype = {
    setup: function() {

      var args,
          type,
          method,
          value,
          data = this.data;

      this.canvas = document.createElement('canvas');
      this._ = this.canvas.getContext('2d');

      this.canvas.className = this.domClass;

      this.canvas.height = this.fullHeight;
      this.canvas.width = this.fullWidth;

      this.points = [];

      // Extract each shape
      for (var i = -1, l = data.length; ++i < l;) {

        args = data[i].slice(1);
        method = data[i][0];

        // Adjust values for given shape type
        if (method in argSignatures) for (var a = -1, al = args.length; ++a < al;) {

          type = argSignatures[method][a];
          value = args[a];

          switch (type) {
            case argTypes.RADIUS:
              value *= this.multiplier;
              break;
            case argTypes.DIM:
              value *= this.multiplier;
              value += this.padding;
              break;
            case argTypes.DEGREE:
              value *= Math.PI/180;
              break;
          }

          args[a] = value;

        }

        args.unshift(0);

        // Plot points and add to points array
        for (var r, pd = this.pointDistance, t = pd; t <= 1; t += pd) {

          // Avoid crap like 0.15000000000000002
          t = Math.round(t*1/pd) / (1/pd);

          args[0] = t;

          r = pathMethods[method].apply(null, args);

          // point index is cached with the point
          this.points.push({
            x: r[0],
            y: r[1],
            progress: t,
            index: this.points.length
          });

        }

      }

    },

    render: function(frame) {

      var points = this.points,
          pointsLength = points.length,
          pd = this.pointDistance,
          point,
          index,
          frameD;

      for (var i = -1, l = pointsLength*this.trailLength; ++i < l && !this.stopped;) {

        index = frame + i;
        point = points[index] || points[index - pointsLength];

        if (!point) continue;

        this.alpha = Math.round(1000*(i/(l-1)))/1000;
        this._.globalAlpha = this.alpha;

        this._.fillStyle = this.fillColor;
        this._.strokeStyle = this.strokeColor;

        frameD = frame/(pointsLength-1);
        indexD = i/(l-1);

        this._preStep(point, indexD, frameD);
        this.stepMethod(point, indexD, frameD);

      }

    },

    draw: function() {

      if (this.stopped) return;

      this._preDraw();

      if (this.clearEveryFrame) {
        this._.clearRect(0, 0, this.fullWidth, this.fullHeight);
      }
      this.render(this.frame);

      this._postDraw();

      this.iterateFrame();

    },

    iterateFrame: function() {

      if (this.frame >= this.points.length) {
        // One loop finished, fire off the hook
        this._complete();
        if (!this.stopped) {
          this.reset();
        }
      } else {
        // We're still running so increment accordingly
        if (this.time) {
          // Use the time to calculate precisely what frame we should be on
          var diff = +(new Date()) - this.start;
          this.partialFrame = this.points.length * (diff / (this.time * 1000));
        } else {
          // No time was set, so use the target
          this.partialFrame = Math.round((this.partialFrame + this.distancePerFrame) * 1000) / 1000;
        }
        this.frame = Math.round(this.partialFrame);
      }

    },

    play: function() {

      this.reset();
      this._prePlay();
      this.loop();

    },

    loop: function () {

      if (!this.stopped) requestAnimationFrame(this.loop.bind(this));
      this.draw();

    },

    stop: function() {

      this.stopped = true;

    },

    reset: function () {

      // Decided what timing method to use
      if (this.time) {
        this.start = +(new Date());
      } else {
        // Otherwise calculate a distance
        this.distancePerFrame = this.stepsPerFrame * (this.fps / this.targetFps);
      }

      // Initialize the frame data
      this.frame = 0;
      this.partialFrame = 0;
      this.stopped = false;

      if (this.clearOnReset) {
        this._.clearRect(0, 0, this.fullWidth, this.fullHeight);
      }
    }

  };

  window.Sonic = Sonic;

}());
