#!/usr/bin/env node
import { createRequire as __reshotCreateRequire } from 'module'; const require = __reshotCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/chunkstream.js
var require_chunkstream = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/chunkstream.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var Stream = __require("stream");
    var ChunkStream = module.exports = function() {
      Stream.call(this);
      this._buffers = [];
      this._buffered = 0;
      this._reads = [];
      this._paused = false;
      this._encoding = "utf8";
      this.writable = true;
    };
    util.inherits(ChunkStream, Stream);
    ChunkStream.prototype.read = function(length, callback) {
      this._reads.push({
        length: Math.abs(length),
        // if length < 0 then at most this length
        allowLess: length < 0,
        func: callback
      });
      process.nextTick(
        function() {
          this._process();
          if (this._paused && this._reads && this._reads.length > 0) {
            this._paused = false;
            this.emit("drain");
          }
        }.bind(this)
      );
    };
    ChunkStream.prototype.write = function(data, encoding) {
      if (!this.writable) {
        this.emit("error", new Error("Stream not writable"));
        return false;
      }
      let dataBuffer;
      if (Buffer.isBuffer(data)) {
        dataBuffer = data;
      } else {
        dataBuffer = Buffer.from(data, encoding || this._encoding);
      }
      this._buffers.push(dataBuffer);
      this._buffered += dataBuffer.length;
      this._process();
      if (this._reads && this._reads.length === 0) {
        this._paused = true;
      }
      return this.writable && !this._paused;
    };
    ChunkStream.prototype.end = function(data, encoding) {
      if (data) {
        this.write(data, encoding);
      }
      this.writable = false;
      if (!this._buffers) {
        return;
      }
      if (this._buffers.length === 0) {
        this._end();
      } else {
        this._buffers.push(null);
        this._process();
      }
    };
    ChunkStream.prototype.destroySoon = ChunkStream.prototype.end;
    ChunkStream.prototype._end = function() {
      if (this._reads.length > 0) {
        this.emit("error", new Error("Unexpected end of input"));
      }
      this.destroy();
    };
    ChunkStream.prototype.destroy = function() {
      if (!this._buffers) {
        return;
      }
      this.writable = false;
      this._reads = null;
      this._buffers = null;
      this.emit("close");
    };
    ChunkStream.prototype._processReadAllowingLess = function(read) {
      this._reads.shift();
      let smallerBuf = this._buffers[0];
      if (smallerBuf.length > read.length) {
        this._buffered -= read.length;
        this._buffers[0] = smallerBuf.slice(read.length);
        read.func.call(this, smallerBuf.slice(0, read.length));
      } else {
        this._buffered -= smallerBuf.length;
        this._buffers.shift();
        read.func.call(this, smallerBuf);
      }
    };
    ChunkStream.prototype._processRead = function(read) {
      this._reads.shift();
      let pos = 0;
      let count = 0;
      let data = Buffer.alloc(read.length);
      while (pos < read.length) {
        let buf = this._buffers[count++];
        let len = Math.min(buf.length, read.length - pos);
        buf.copy(data, pos, 0, len);
        pos += len;
        if (len !== buf.length) {
          this._buffers[--count] = buf.slice(len);
        }
      }
      if (count > 0) {
        this._buffers.splice(0, count);
      }
      this._buffered -= read.length;
      read.func.call(this, data);
    };
    ChunkStream.prototype._process = function() {
      try {
        while (this._buffered > 0 && this._reads && this._reads.length > 0) {
          let read = this._reads[0];
          if (read.allowLess) {
            this._processReadAllowingLess(read);
          } else if (this._buffered >= read.length) {
            this._processRead(read);
          } else {
            break;
          }
        }
        if (this._buffers && !this.writable) {
          this._end();
        }
      } catch (ex) {
        this.emit("error", ex);
      }
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/interlace.js
var require_interlace = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/interlace.js"(exports) {
    "use strict";
    var imagePasses = [
      {
        // pass 1 - 1px
        x: [0],
        y: [0]
      },
      {
        // pass 2 - 1px
        x: [4],
        y: [0]
      },
      {
        // pass 3 - 2px
        x: [0, 4],
        y: [4]
      },
      {
        // pass 4 - 4px
        x: [2, 6],
        y: [0, 4]
      },
      {
        // pass 5 - 8px
        x: [0, 2, 4, 6],
        y: [2, 6]
      },
      {
        // pass 6 - 16px
        x: [1, 3, 5, 7],
        y: [0, 2, 4, 6]
      },
      {
        // pass 7 - 32px
        x: [0, 1, 2, 3, 4, 5, 6, 7],
        y: [1, 3, 5, 7]
      }
    ];
    exports.getImagePasses = function(width, height) {
      let images = [];
      let xLeftOver = width % 8;
      let yLeftOver = height % 8;
      let xRepeats = (width - xLeftOver) / 8;
      let yRepeats = (height - yLeftOver) / 8;
      for (let i = 0; i < imagePasses.length; i++) {
        let pass = imagePasses[i];
        let passWidth = xRepeats * pass.x.length;
        let passHeight = yRepeats * pass.y.length;
        for (let j = 0; j < pass.x.length; j++) {
          if (pass.x[j] < xLeftOver) {
            passWidth++;
          } else {
            break;
          }
        }
        for (let j = 0; j < pass.y.length; j++) {
          if (pass.y[j] < yLeftOver) {
            passHeight++;
          } else {
            break;
          }
        }
        if (passWidth > 0 && passHeight > 0) {
          images.push({ width: passWidth, height: passHeight, index: i });
        }
      }
      return images;
    };
    exports.getInterlaceIterator = function(width) {
      return function(x, y, pass) {
        let outerXLeftOver = x % imagePasses[pass].x.length;
        let outerX = (x - outerXLeftOver) / imagePasses[pass].x.length * 8 + imagePasses[pass].x[outerXLeftOver];
        let outerYLeftOver = y % imagePasses[pass].y.length;
        let outerY = (y - outerYLeftOver) / imagePasses[pass].y.length * 8 + imagePasses[pass].y[outerYLeftOver];
        return outerX * 4 + outerY * width * 4;
      };
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/paeth-predictor.js
var require_paeth_predictor = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/paeth-predictor.js"(exports, module) {
    "use strict";
    module.exports = function paethPredictor(left, above, upLeft) {
      let paeth = left + above - upLeft;
      let pLeft = Math.abs(paeth - left);
      let pAbove = Math.abs(paeth - above);
      let pUpLeft = Math.abs(paeth - upLeft);
      if (pLeft <= pAbove && pLeft <= pUpLeft) {
        return left;
      }
      if (pAbove <= pUpLeft) {
        return above;
      }
      return upLeft;
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/filter-parse.js
var require_filter_parse = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/filter-parse.js"(exports, module) {
    "use strict";
    var interlaceUtils = require_interlace();
    var paethPredictor = require_paeth_predictor();
    function getByteWidth(width, bpp, depth) {
      let byteWidth = width * bpp;
      if (depth !== 8) {
        byteWidth = Math.ceil(byteWidth / (8 / depth));
      }
      return byteWidth;
    }
    var Filter = module.exports = function(bitmapInfo, dependencies) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let interlace = bitmapInfo.interlace;
      let bpp = bitmapInfo.bpp;
      let depth = bitmapInfo.depth;
      this.read = dependencies.read;
      this.write = dependencies.write;
      this.complete = dependencies.complete;
      this._imageIndex = 0;
      this._images = [];
      if (interlace) {
        let passes = interlaceUtils.getImagePasses(width, height);
        for (let i = 0; i < passes.length; i++) {
          this._images.push({
            byteWidth: getByteWidth(passes[i].width, bpp, depth),
            height: passes[i].height,
            lineIndex: 0
          });
        }
      } else {
        this._images.push({
          byteWidth: getByteWidth(width, bpp, depth),
          height,
          lineIndex: 0
        });
      }
      if (depth === 8) {
        this._xComparison = bpp;
      } else if (depth === 16) {
        this._xComparison = bpp * 2;
      } else {
        this._xComparison = 1;
      }
    };
    Filter.prototype.start = function() {
      this.read(
        this._images[this._imageIndex].byteWidth + 1,
        this._reverseFilterLine.bind(this)
      );
    };
    Filter.prototype._unFilterType1 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f1Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        unfilteredLine[x] = rawByte + f1Left;
      }
    };
    Filter.prototype._unFilterType2 = function(rawData, unfilteredLine, byteWidth) {
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f2Up = lastLine ? lastLine[x] : 0;
        unfilteredLine[x] = rawByte + f2Up;
      }
    };
    Filter.prototype._unFilterType3 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f3Up = lastLine ? lastLine[x] : 0;
        let f3Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f3Add = Math.floor((f3Left + f3Up) / 2);
        unfilteredLine[x] = rawByte + f3Add;
      }
    };
    Filter.prototype._unFilterType4 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f4Up = lastLine ? lastLine[x] : 0;
        let f4Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f4UpLeft = x > xBiggerThan && lastLine ? lastLine[x - xComparison] : 0;
        let f4Add = paethPredictor(f4Left, f4Up, f4UpLeft);
        unfilteredLine[x] = rawByte + f4Add;
      }
    };
    Filter.prototype._reverseFilterLine = function(rawData) {
      let filter = rawData[0];
      let unfilteredLine;
      let currentImage = this._images[this._imageIndex];
      let byteWidth = currentImage.byteWidth;
      if (filter === 0) {
        unfilteredLine = rawData.slice(1, byteWidth + 1);
      } else {
        unfilteredLine = Buffer.alloc(byteWidth);
        switch (filter) {
          case 1:
            this._unFilterType1(rawData, unfilteredLine, byteWidth);
            break;
          case 2:
            this._unFilterType2(rawData, unfilteredLine, byteWidth);
            break;
          case 3:
            this._unFilterType3(rawData, unfilteredLine, byteWidth);
            break;
          case 4:
            this._unFilterType4(rawData, unfilteredLine, byteWidth);
            break;
          default:
            throw new Error("Unrecognised filter type - " + filter);
        }
      }
      this.write(unfilteredLine);
      currentImage.lineIndex++;
      if (currentImage.lineIndex >= currentImage.height) {
        this._lastLine = null;
        this._imageIndex++;
        currentImage = this._images[this._imageIndex];
      } else {
        this._lastLine = unfilteredLine;
      }
      if (currentImage) {
        this.read(currentImage.byteWidth + 1, this._reverseFilterLine.bind(this));
      } else {
        this._lastLine = null;
        this.complete();
      }
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/filter-parse-async.js
var require_filter_parse_async = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/filter-parse-async.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var ChunkStream = require_chunkstream();
    var Filter = require_filter_parse();
    var FilterAsync = module.exports = function(bitmapInfo) {
      ChunkStream.call(this);
      let buffers = [];
      let that = this;
      this._filter = new Filter(bitmapInfo, {
        read: this.read.bind(this),
        write: function(buffer) {
          buffers.push(buffer);
        },
        complete: function() {
          that.emit("complete", Buffer.concat(buffers));
        }
      });
      this._filter.start();
    };
    util.inherits(FilterAsync, ChunkStream);
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/constants.js
var require_constants = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/constants.js"(exports, module) {
    "use strict";
    module.exports = {
      PNG_SIGNATURE: [137, 80, 78, 71, 13, 10, 26, 10],
      TYPE_IHDR: 1229472850,
      TYPE_IEND: 1229278788,
      TYPE_IDAT: 1229209940,
      TYPE_PLTE: 1347179589,
      TYPE_tRNS: 1951551059,
      // eslint-disable-line camelcase
      TYPE_gAMA: 1732332865,
      // eslint-disable-line camelcase
      // color-type bits
      COLORTYPE_GRAYSCALE: 0,
      COLORTYPE_PALETTE: 1,
      COLORTYPE_COLOR: 2,
      COLORTYPE_ALPHA: 4,
      // e.g. grayscale and alpha
      // color-type combinations
      COLORTYPE_PALETTE_COLOR: 3,
      COLORTYPE_COLOR_ALPHA: 6,
      COLORTYPE_TO_BPP_MAP: {
        0: 1,
        2: 3,
        3: 1,
        4: 2,
        6: 4
      },
      GAMMA_DIVISION: 1e5
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/crc.js
var require_crc = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/crc.js"(exports, module) {
    "use strict";
    var crcTable = [];
    (function() {
      for (let i = 0; i < 256; i++) {
        let currentCrc = i;
        for (let j = 0; j < 8; j++) {
          if (currentCrc & 1) {
            currentCrc = 3988292384 ^ currentCrc >>> 1;
          } else {
            currentCrc = currentCrc >>> 1;
          }
        }
        crcTable[i] = currentCrc;
      }
    })();
    var CrcCalculator = module.exports = function() {
      this._crc = -1;
    };
    CrcCalculator.prototype.write = function(data) {
      for (let i = 0; i < data.length; i++) {
        this._crc = crcTable[(this._crc ^ data[i]) & 255] ^ this._crc >>> 8;
      }
      return true;
    };
    CrcCalculator.prototype.crc32 = function() {
      return this._crc ^ -1;
    };
    CrcCalculator.crc32 = function(buf) {
      let crc = -1;
      for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 255] ^ crc >>> 8;
      }
      return crc ^ -1;
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/parser.js
var require_parser = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/parser.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    var CrcCalculator = require_crc();
    var Parser = module.exports = function(options, dependencies) {
      this._options = options;
      options.checkCRC = options.checkCRC !== false;
      this._hasIHDR = false;
      this._hasIEND = false;
      this._emittedHeadersFinished = false;
      this._palette = [];
      this._colorType = 0;
      this._chunks = {};
      this._chunks[constants.TYPE_IHDR] = this._handleIHDR.bind(this);
      this._chunks[constants.TYPE_IEND] = this._handleIEND.bind(this);
      this._chunks[constants.TYPE_IDAT] = this._handleIDAT.bind(this);
      this._chunks[constants.TYPE_PLTE] = this._handlePLTE.bind(this);
      this._chunks[constants.TYPE_tRNS] = this._handleTRNS.bind(this);
      this._chunks[constants.TYPE_gAMA] = this._handleGAMA.bind(this);
      this.read = dependencies.read;
      this.error = dependencies.error;
      this.metadata = dependencies.metadata;
      this.gamma = dependencies.gamma;
      this.transColor = dependencies.transColor;
      this.palette = dependencies.palette;
      this.parsed = dependencies.parsed;
      this.inflateData = dependencies.inflateData;
      this.finished = dependencies.finished;
      this.simpleTransparency = dependencies.simpleTransparency;
      this.headersFinished = dependencies.headersFinished || function() {
      };
    };
    Parser.prototype.start = function() {
      this.read(constants.PNG_SIGNATURE.length, this._parseSignature.bind(this));
    };
    Parser.prototype._parseSignature = function(data) {
      let signature = constants.PNG_SIGNATURE;
      for (let i = 0; i < signature.length; i++) {
        if (data[i] !== signature[i]) {
          this.error(new Error("Invalid file signature"));
          return;
        }
      }
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser.prototype._parseChunkBegin = function(data) {
      let length = data.readUInt32BE(0);
      let type = data.readUInt32BE(4);
      let name = "";
      for (let i = 4; i < 8; i++) {
        name += String.fromCharCode(data[i]);
      }
      let ancillary = Boolean(data[4] & 32);
      if (!this._hasIHDR && type !== constants.TYPE_IHDR) {
        this.error(new Error("Expected IHDR on beggining"));
        return;
      }
      this._crc = new CrcCalculator();
      this._crc.write(Buffer.from(name));
      if (this._chunks[type]) {
        return this._chunks[type](length);
      }
      if (!ancillary) {
        this.error(new Error("Unsupported critical chunk type " + name));
        return;
      }
      this.read(length + 4, this._skipChunk.bind(this));
    };
    Parser.prototype._skipChunk = function() {
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser.prototype._handleChunkEnd = function() {
      this.read(4, this._parseChunkEnd.bind(this));
    };
    Parser.prototype._parseChunkEnd = function(data) {
      let fileCrc = data.readInt32BE(0);
      let calcCrc = this._crc.crc32();
      if (this._options.checkCRC && calcCrc !== fileCrc) {
        this.error(new Error("Crc error - " + fileCrc + " - " + calcCrc));
        return;
      }
      if (!this._hasIEND) {
        this.read(8, this._parseChunkBegin.bind(this));
      }
    };
    Parser.prototype._handleIHDR = function(length) {
      this.read(length, this._parseIHDR.bind(this));
    };
    Parser.prototype._parseIHDR = function(data) {
      this._crc.write(data);
      let width = data.readUInt32BE(0);
      let height = data.readUInt32BE(4);
      let depth = data[8];
      let colorType = data[9];
      let compr = data[10];
      let filter = data[11];
      let interlace = data[12];
      if (depth !== 8 && depth !== 4 && depth !== 2 && depth !== 1 && depth !== 16) {
        this.error(new Error("Unsupported bit depth " + depth));
        return;
      }
      if (!(colorType in constants.COLORTYPE_TO_BPP_MAP)) {
        this.error(new Error("Unsupported color type"));
        return;
      }
      if (compr !== 0) {
        this.error(new Error("Unsupported compression method"));
        return;
      }
      if (filter !== 0) {
        this.error(new Error("Unsupported filter method"));
        return;
      }
      if (interlace !== 0 && interlace !== 1) {
        this.error(new Error("Unsupported interlace method"));
        return;
      }
      this._colorType = colorType;
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._colorType];
      this._hasIHDR = true;
      this.metadata({
        width,
        height,
        depth,
        interlace: Boolean(interlace),
        palette: Boolean(colorType & constants.COLORTYPE_PALETTE),
        color: Boolean(colorType & constants.COLORTYPE_COLOR),
        alpha: Boolean(colorType & constants.COLORTYPE_ALPHA),
        bpp,
        colorType
      });
      this._handleChunkEnd();
    };
    Parser.prototype._handlePLTE = function(length) {
      this.read(length, this._parsePLTE.bind(this));
    };
    Parser.prototype._parsePLTE = function(data) {
      this._crc.write(data);
      let entries = Math.floor(data.length / 3);
      for (let i = 0; i < entries; i++) {
        this._palette.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2], 255]);
      }
      this.palette(this._palette);
      this._handleChunkEnd();
    };
    Parser.prototype._handleTRNS = function(length) {
      this.simpleTransparency();
      this.read(length, this._parseTRNS.bind(this));
    };
    Parser.prototype._parseTRNS = function(data) {
      this._crc.write(data);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR) {
        if (this._palette.length === 0) {
          this.error(new Error("Transparency chunk must be after palette"));
          return;
        }
        if (data.length > this._palette.length) {
          this.error(new Error("More transparent colors than palette size"));
          return;
        }
        for (let i = 0; i < data.length; i++) {
          this._palette[i][3] = data[i];
        }
        this.palette(this._palette);
      }
      if (this._colorType === constants.COLORTYPE_GRAYSCALE) {
        this.transColor([data.readUInt16BE(0)]);
      }
      if (this._colorType === constants.COLORTYPE_COLOR) {
        this.transColor([
          data.readUInt16BE(0),
          data.readUInt16BE(2),
          data.readUInt16BE(4)
        ]);
      }
      this._handleChunkEnd();
    };
    Parser.prototype._handleGAMA = function(length) {
      this.read(length, this._parseGAMA.bind(this));
    };
    Parser.prototype._parseGAMA = function(data) {
      this._crc.write(data);
      this.gamma(data.readUInt32BE(0) / constants.GAMMA_DIVISION);
      this._handleChunkEnd();
    };
    Parser.prototype._handleIDAT = function(length) {
      if (!this._emittedHeadersFinished) {
        this._emittedHeadersFinished = true;
        this.headersFinished();
      }
      this.read(-length, this._parseIDAT.bind(this, length));
    };
    Parser.prototype._parseIDAT = function(length, data) {
      this._crc.write(data);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR && this._palette.length === 0) {
        throw new Error("Expected palette not found");
      }
      this.inflateData(data);
      let leftOverLength = length - data.length;
      if (leftOverLength > 0) {
        this._handleIDAT(leftOverLength);
      } else {
        this._handleChunkEnd();
      }
    };
    Parser.prototype._handleIEND = function(length) {
      this.read(length, this._parseIEND.bind(this));
    };
    Parser.prototype._parseIEND = function(data) {
      this._crc.write(data);
      this._hasIEND = true;
      this._handleChunkEnd();
      if (this.finished) {
        this.finished();
      }
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/bitmapper.js
var require_bitmapper = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/bitmapper.js"(exports) {
    "use strict";
    var interlaceUtils = require_interlace();
    var pixelBppMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, data, pxPos, rawPos) {
        if (rawPos === data.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = 255;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 1 >= data.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = data[rawPos + 1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 2 >= data.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data[rawPos];
        pxData[pxPos + 1] = data[rawPos + 1];
        pxData[pxPos + 2] = data[rawPos + 2];
        pxData[pxPos + 3] = 255;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 3 >= data.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data[rawPos];
        pxData[pxPos + 1] = data[rawPos + 1];
        pxData[pxPos + 2] = data[rawPos + 2];
        pxData[pxPos + 3] = data[rawPos + 3];
      }
    ];
    var pixelBppCustomMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = maxBit;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, pixelData, pxPos) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = pixelData[1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = maxBit;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, pixelData, pxPos) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = pixelData[3];
      }
    ];
    function bitRetriever(data, depth) {
      let leftOver = [];
      let i = 0;
      function split() {
        if (i === data.length) {
          throw new Error("Ran out of data");
        }
        let byte = data[i];
        i++;
        let byte8, byte7, byte6, byte5, byte4, byte3, byte2, byte1;
        switch (depth) {
          default:
            throw new Error("unrecognised depth");
          case 16:
            byte2 = data[i];
            i++;
            leftOver.push((byte << 8) + byte2);
            break;
          case 4:
            byte2 = byte & 15;
            byte1 = byte >> 4;
            leftOver.push(byte1, byte2);
            break;
          case 2:
            byte4 = byte & 3;
            byte3 = byte >> 2 & 3;
            byte2 = byte >> 4 & 3;
            byte1 = byte >> 6 & 3;
            leftOver.push(byte1, byte2, byte3, byte4);
            break;
          case 1:
            byte8 = byte & 1;
            byte7 = byte >> 1 & 1;
            byte6 = byte >> 2 & 1;
            byte5 = byte >> 3 & 1;
            byte4 = byte >> 4 & 1;
            byte3 = byte >> 5 & 1;
            byte2 = byte >> 6 & 1;
            byte1 = byte >> 7 & 1;
            leftOver.push(byte1, byte2, byte3, byte4, byte5, byte6, byte7, byte8);
            break;
        }
      }
      return {
        get: function(count) {
          while (leftOver.length < count) {
            split();
          }
          let returner = leftOver.slice(0, count);
          leftOver = leftOver.slice(count);
          return returner;
        },
        resetAfterLine: function() {
          leftOver.length = 0;
        },
        end: function() {
          if (i !== data.length) {
            throw new Error("extra data found");
          }
        }
      };
    }
    function mapImage8Bit(image, pxData, getPxPos, bpp, data, rawPos) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppMapper[bpp](pxData, data, pxPos, rawPos);
          rawPos += bpp;
        }
      }
      return rawPos;
    }
    function mapImageCustomBit(image, pxData, getPxPos, bpp, bits, maxBit) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pixelData = bits.get(bpp);
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppCustomMapper[bpp](pxData, pixelData, pxPos, maxBit);
        }
        bits.resetAfterLine();
      }
    }
    exports.dataToBitMap = function(data, bitmapInfo) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let depth = bitmapInfo.depth;
      let bpp = bitmapInfo.bpp;
      let interlace = bitmapInfo.interlace;
      let bits;
      if (depth !== 8) {
        bits = bitRetriever(data, depth);
      }
      let pxData;
      if (depth <= 8) {
        pxData = Buffer.alloc(width * height * 4);
      } else {
        pxData = new Uint16Array(width * height * 4);
      }
      let maxBit = Math.pow(2, depth) - 1;
      let rawPos = 0;
      let images;
      let getPxPos;
      if (interlace) {
        images = interlaceUtils.getImagePasses(width, height);
        getPxPos = interlaceUtils.getInterlaceIterator(width, height);
      } else {
        let nonInterlacedPxPos = 0;
        getPxPos = function() {
          let returner = nonInterlacedPxPos;
          nonInterlacedPxPos += 4;
          return returner;
        };
        images = [{ width, height }];
      }
      for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
        if (depth === 8) {
          rawPos = mapImage8Bit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            data,
            rawPos
          );
        } else {
          mapImageCustomBit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            bits,
            maxBit
          );
        }
      }
      if (depth === 8) {
        if (rawPos !== data.length) {
          throw new Error("extra data found");
        }
      } else {
        bits.end();
      }
      return pxData;
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/format-normaliser.js
var require_format_normaliser = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/format-normaliser.js"(exports, module) {
    "use strict";
    function dePalette(indata, outdata, width, height, palette) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let color = palette[indata[pxPos]];
          if (!color) {
            throw new Error("index " + indata[pxPos] + " not in palette");
          }
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = color[i];
          }
          pxPos += 4;
        }
      }
    }
    function replaceTransparentColor(indata, outdata, width, height, transColor) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let makeTrans = false;
          if (transColor.length === 1) {
            if (transColor[0] === indata[pxPos]) {
              makeTrans = true;
            }
          } else if (transColor[0] === indata[pxPos] && transColor[1] === indata[pxPos + 1] && transColor[2] === indata[pxPos + 2]) {
            makeTrans = true;
          }
          if (makeTrans) {
            for (let i = 0; i < 4; i++) {
              outdata[pxPos + i] = 0;
            }
          }
          pxPos += 4;
        }
      }
    }
    function scaleDepth(indata, outdata, width, height, depth) {
      let maxOutSample = 255;
      let maxInSample = Math.pow(2, depth) - 1;
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = Math.floor(
              indata[pxPos + i] * maxOutSample / maxInSample + 0.5
            );
          }
          pxPos += 4;
        }
      }
    }
    module.exports = function(indata, imageData, skipRescale = false) {
      let depth = imageData.depth;
      let width = imageData.width;
      let height = imageData.height;
      let colorType = imageData.colorType;
      let transColor = imageData.transColor;
      let palette = imageData.palette;
      let outdata = indata;
      if (colorType === 3) {
        dePalette(indata, outdata, width, height, palette);
      } else {
        if (transColor) {
          replaceTransparentColor(indata, outdata, width, height, transColor);
        }
        if (depth !== 8 && !skipRescale) {
          if (depth === 16) {
            outdata = Buffer.alloc(width * height * 4);
          }
          scaleDepth(indata, outdata, width, height, depth);
        }
      }
      return outdata;
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/parser-async.js
var require_parser_async = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/parser-async.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var zlib = __require("zlib");
    var ChunkStream = require_chunkstream();
    var FilterAsync = require_filter_parse_async();
    var Parser = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    var ParserAsync = module.exports = function(options) {
      ChunkStream.call(this);
      this._parser = new Parser(options, {
        read: this.read.bind(this),
        error: this._handleError.bind(this),
        metadata: this._handleMetaData.bind(this),
        gamma: this.emit.bind(this, "gamma"),
        palette: this._handlePalette.bind(this),
        transColor: this._handleTransColor.bind(this),
        finished: this._finished.bind(this),
        inflateData: this._inflateData.bind(this),
        simpleTransparency: this._simpleTransparency.bind(this),
        headersFinished: this._headersFinished.bind(this)
      });
      this._options = options;
      this.writable = true;
      this._parser.start();
    };
    util.inherits(ParserAsync, ChunkStream);
    ParserAsync.prototype._handleError = function(err) {
      this.emit("error", err);
      this.writable = false;
      this.destroy();
      if (this._inflate && this._inflate.destroy) {
        this._inflate.destroy();
      }
      if (this._filter) {
        this._filter.destroy();
        this._filter.on("error", function() {
        });
      }
      this.errord = true;
    };
    ParserAsync.prototype._inflateData = function(data) {
      if (!this._inflate) {
        if (this._bitmapInfo.interlace) {
          this._inflate = zlib.createInflate();
          this._inflate.on("error", this.emit.bind(this, "error"));
          this._filter.on("complete", this._complete.bind(this));
          this._inflate.pipe(this._filter);
        } else {
          let rowSize = (this._bitmapInfo.width * this._bitmapInfo.bpp * this._bitmapInfo.depth + 7 >> 3) + 1;
          let imageSize = rowSize * this._bitmapInfo.height;
          let chunkSize = Math.max(imageSize, zlib.Z_MIN_CHUNK);
          this._inflate = zlib.createInflate({ chunkSize });
          let leftToInflate = imageSize;
          let emitError = this.emit.bind(this, "error");
          this._inflate.on("error", function(err) {
            if (!leftToInflate) {
              return;
            }
            emitError(err);
          });
          this._filter.on("complete", this._complete.bind(this));
          let filterWrite = this._filter.write.bind(this._filter);
          this._inflate.on("data", function(chunk) {
            if (!leftToInflate) {
              return;
            }
            if (chunk.length > leftToInflate) {
              chunk = chunk.slice(0, leftToInflate);
            }
            leftToInflate -= chunk.length;
            filterWrite(chunk);
          });
          this._inflate.on("end", this._filter.end.bind(this._filter));
        }
      }
      this._inflate.write(data);
    };
    ParserAsync.prototype._handleMetaData = function(metaData) {
      this._metaData = metaData;
      this._bitmapInfo = Object.create(metaData);
      this._filter = new FilterAsync(this._bitmapInfo);
    };
    ParserAsync.prototype._handleTransColor = function(transColor) {
      this._bitmapInfo.transColor = transColor;
    };
    ParserAsync.prototype._handlePalette = function(palette) {
      this._bitmapInfo.palette = palette;
    };
    ParserAsync.prototype._simpleTransparency = function() {
      this._metaData.alpha = true;
    };
    ParserAsync.prototype._headersFinished = function() {
      this.emit("metadata", this._metaData);
    };
    ParserAsync.prototype._finished = function() {
      if (this.errord) {
        return;
      }
      if (!this._inflate) {
        this.emit("error", "No Inflate block");
      } else {
        this._inflate.end();
      }
    };
    ParserAsync.prototype._complete = function(filteredData) {
      if (this.errord) {
        return;
      }
      let normalisedBitmapData;
      try {
        let bitmapData = bitmapper.dataToBitMap(filteredData, this._bitmapInfo);
        normalisedBitmapData = formatNormaliser(
          bitmapData,
          this._bitmapInfo,
          this._options.skipRescale
        );
        bitmapData = null;
      } catch (ex) {
        this._handleError(ex);
        return;
      }
      this.emit("parsed", normalisedBitmapData);
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/bitpacker.js
var require_bitpacker = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/bitpacker.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    module.exports = function(dataIn, width, height, options) {
      let outHasAlpha = [constants.COLORTYPE_COLOR_ALPHA, constants.COLORTYPE_ALPHA].indexOf(
        options.colorType
      ) !== -1;
      if (options.colorType === options.inputColorType) {
        let bigEndian = (function() {
          let buffer = new ArrayBuffer(2);
          new DataView(buffer).setInt16(
            0,
            256,
            true
            /* littleEndian */
          );
          return new Int16Array(buffer)[0] !== 256;
        })();
        if (options.bitDepth === 8 || options.bitDepth === 16 && bigEndian) {
          return dataIn;
        }
      }
      let data = options.bitDepth !== 16 ? dataIn : new Uint16Array(dataIn.buffer);
      let maxValue = 255;
      let inBpp = constants.COLORTYPE_TO_BPP_MAP[options.inputColorType];
      if (inBpp === 4 && !options.inputHasAlpha) {
        inBpp = 3;
      }
      let outBpp = constants.COLORTYPE_TO_BPP_MAP[options.colorType];
      if (options.bitDepth === 16) {
        maxValue = 65535;
        outBpp *= 2;
      }
      let outData = Buffer.alloc(width * height * outBpp);
      let inIndex = 0;
      let outIndex = 0;
      let bgColor = options.bgColor || {};
      if (bgColor.red === void 0) {
        bgColor.red = maxValue;
      }
      if (bgColor.green === void 0) {
        bgColor.green = maxValue;
      }
      if (bgColor.blue === void 0) {
        bgColor.blue = maxValue;
      }
      function getRGBA() {
        let red;
        let green;
        let blue;
        let alpha = maxValue;
        switch (options.inputColorType) {
          case constants.COLORTYPE_COLOR_ALPHA:
            alpha = data[inIndex + 3];
            red = data[inIndex];
            green = data[inIndex + 1];
            blue = data[inIndex + 2];
            break;
          case constants.COLORTYPE_COLOR:
            red = data[inIndex];
            green = data[inIndex + 1];
            blue = data[inIndex + 2];
            break;
          case constants.COLORTYPE_ALPHA:
            alpha = data[inIndex + 1];
            red = data[inIndex];
            green = red;
            blue = red;
            break;
          case constants.COLORTYPE_GRAYSCALE:
            red = data[inIndex];
            green = red;
            blue = red;
            break;
          default:
            throw new Error(
              "input color type:" + options.inputColorType + " is not supported at present"
            );
        }
        if (options.inputHasAlpha) {
          if (!outHasAlpha) {
            alpha /= maxValue;
            red = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.red + alpha * red), 0),
              maxValue
            );
            green = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.green + alpha * green), 0),
              maxValue
            );
            blue = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.blue + alpha * blue), 0),
              maxValue
            );
          }
        }
        return { red, green, blue, alpha };
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let rgba = getRGBA(data, inIndex);
          switch (options.colorType) {
            case constants.COLORTYPE_COLOR_ALPHA:
            case constants.COLORTYPE_COLOR:
              if (options.bitDepth === 8) {
                outData[outIndex] = rgba.red;
                outData[outIndex + 1] = rgba.green;
                outData[outIndex + 2] = rgba.blue;
                if (outHasAlpha) {
                  outData[outIndex + 3] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(rgba.red, outIndex);
                outData.writeUInt16BE(rgba.green, outIndex + 2);
                outData.writeUInt16BE(rgba.blue, outIndex + 4);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 6);
                }
              }
              break;
            case constants.COLORTYPE_ALPHA:
            case constants.COLORTYPE_GRAYSCALE: {
              let grayscale = (rgba.red + rgba.green + rgba.blue) / 3;
              if (options.bitDepth === 8) {
                outData[outIndex] = grayscale;
                if (outHasAlpha) {
                  outData[outIndex + 1] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(grayscale, outIndex);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 2);
                }
              }
              break;
            }
            default:
              throw new Error("unrecognised color Type " + options.colorType);
          }
          inIndex += inBpp;
          outIndex += outBpp;
        }
      }
      return outData;
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/filter-pack.js
var require_filter_pack = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/filter-pack.js"(exports, module) {
    "use strict";
    var paethPredictor = require_paeth_predictor();
    function filterNone(pxData, pxPos, byteWidth, rawData, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        rawData[rawPos + x] = pxData[pxPos + x];
      }
    }
    function filterSumNone(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length = pxPos + byteWidth;
      for (let i = pxPos; i < length; i++) {
        sum += Math.abs(pxData[i]);
      }
      return sum;
    }
    function filterSub(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        rawData[rawPos + x] = val;
      }
    }
    function filterSumSub(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterUp(pxData, pxPos, byteWidth, rawData, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - up;
        rawData[rawPos + x] = val;
      }
    }
    function filterSumUp(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length = pxPos + byteWidth;
      for (let x = pxPos; x < length; x++) {
        let up = pxPos > 0 ? pxData[x - byteWidth] : 0;
        let val = pxData[x] - up;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterAvg(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        rawData[rawPos + x] = val;
      }
    }
    function filterSumAvg(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterPaeth(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        rawData[rawPos + x] = val;
      }
    }
    function filterSumPaeth(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        sum += Math.abs(val);
      }
      return sum;
    }
    var filters = {
      0: filterNone,
      1: filterSub,
      2: filterUp,
      3: filterAvg,
      4: filterPaeth
    };
    var filterSums = {
      0: filterSumNone,
      1: filterSumSub,
      2: filterSumUp,
      3: filterSumAvg,
      4: filterSumPaeth
    };
    module.exports = function(pxData, width, height, options, bpp) {
      let filterTypes;
      if (!("filterType" in options) || options.filterType === -1) {
        filterTypes = [0, 1, 2, 3, 4];
      } else if (typeof options.filterType === "number") {
        filterTypes = [options.filterType];
      } else {
        throw new Error("unrecognised filter types");
      }
      if (options.bitDepth === 16) {
        bpp *= 2;
      }
      let byteWidth = width * bpp;
      let rawPos = 0;
      let pxPos = 0;
      let rawData = Buffer.alloc((byteWidth + 1) * height);
      let sel = filterTypes[0];
      for (let y = 0; y < height; y++) {
        if (filterTypes.length > 1) {
          let min = Infinity;
          for (let i = 0; i < filterTypes.length; i++) {
            let sum = filterSums[filterTypes[i]](pxData, pxPos, byteWidth, bpp);
            if (sum < min) {
              sel = filterTypes[i];
              min = sum;
            }
          }
        }
        rawData[rawPos] = sel;
        rawPos++;
        filters[sel](pxData, pxPos, byteWidth, rawData, rawPos, bpp);
        rawPos += byteWidth;
        pxPos += byteWidth;
      }
      return rawData;
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/packer.js
var require_packer = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/packer.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    var CrcStream = require_crc();
    var bitPacker = require_bitpacker();
    var filter = require_filter_pack();
    var zlib = __require("zlib");
    var Packer = module.exports = function(options) {
      this._options = options;
      options.deflateChunkSize = options.deflateChunkSize || 32 * 1024;
      options.deflateLevel = options.deflateLevel != null ? options.deflateLevel : 9;
      options.deflateStrategy = options.deflateStrategy != null ? options.deflateStrategy : 3;
      options.inputHasAlpha = options.inputHasAlpha != null ? options.inputHasAlpha : true;
      options.deflateFactory = options.deflateFactory || zlib.createDeflate;
      options.bitDepth = options.bitDepth || 8;
      options.colorType = typeof options.colorType === "number" ? options.colorType : constants.COLORTYPE_COLOR_ALPHA;
      options.inputColorType = typeof options.inputColorType === "number" ? options.inputColorType : constants.COLORTYPE_COLOR_ALPHA;
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.colorType) === -1) {
        throw new Error(
          "option color type:" + options.colorType + " is not supported at present"
        );
      }
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.inputColorType) === -1) {
        throw new Error(
          "option input color type:" + options.inputColorType + " is not supported at present"
        );
      }
      if (options.bitDepth !== 8 && options.bitDepth !== 16) {
        throw new Error(
          "option bit depth:" + options.bitDepth + " is not supported at present"
        );
      }
    };
    Packer.prototype.getDeflateOptions = function() {
      return {
        chunkSize: this._options.deflateChunkSize,
        level: this._options.deflateLevel,
        strategy: this._options.deflateStrategy
      };
    };
    Packer.prototype.createDeflate = function() {
      return this._options.deflateFactory(this.getDeflateOptions());
    };
    Packer.prototype.filterData = function(data, width, height) {
      let packedData = bitPacker(data, width, height, this._options);
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._options.colorType];
      let filteredData = filter(packedData, width, height, this._options, bpp);
      return filteredData;
    };
    Packer.prototype._packChunk = function(type, data) {
      let len = data ? data.length : 0;
      let buf = Buffer.alloc(len + 12);
      buf.writeUInt32BE(len, 0);
      buf.writeUInt32BE(type, 4);
      if (data) {
        data.copy(buf, 8);
      }
      buf.writeInt32BE(
        CrcStream.crc32(buf.slice(4, buf.length - 4)),
        buf.length - 4
      );
      return buf;
    };
    Packer.prototype.packGAMA = function(gamma) {
      let buf = Buffer.alloc(4);
      buf.writeUInt32BE(Math.floor(gamma * constants.GAMMA_DIVISION), 0);
      return this._packChunk(constants.TYPE_gAMA, buf);
    };
    Packer.prototype.packIHDR = function(width, height) {
      let buf = Buffer.alloc(13);
      buf.writeUInt32BE(width, 0);
      buf.writeUInt32BE(height, 4);
      buf[8] = this._options.bitDepth;
      buf[9] = this._options.colorType;
      buf[10] = 0;
      buf[11] = 0;
      buf[12] = 0;
      return this._packChunk(constants.TYPE_IHDR, buf);
    };
    Packer.prototype.packIDAT = function(data) {
      return this._packChunk(constants.TYPE_IDAT, data);
    };
    Packer.prototype.packIEND = function() {
      return this._packChunk(constants.TYPE_IEND, null);
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/packer-async.js
var require_packer_async = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/packer-async.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var Stream = __require("stream");
    var constants = require_constants();
    var Packer = require_packer();
    var PackerAsync = module.exports = function(opt) {
      Stream.call(this);
      let options = opt || {};
      this._packer = new Packer(options);
      this._deflate = this._packer.createDeflate();
      this.readable = true;
    };
    util.inherits(PackerAsync, Stream);
    PackerAsync.prototype.pack = function(data, width, height, gamma) {
      this.emit("data", Buffer.from(constants.PNG_SIGNATURE));
      this.emit("data", this._packer.packIHDR(width, height));
      if (gamma) {
        this.emit("data", this._packer.packGAMA(gamma));
      }
      let filteredData = this._packer.filterData(data, width, height);
      this._deflate.on("error", this.emit.bind(this, "error"));
      this._deflate.on(
        "data",
        function(compressedData) {
          this.emit("data", this._packer.packIDAT(compressedData));
        }.bind(this)
      );
      this._deflate.on(
        "end",
        function() {
          this.emit("data", this._packer.packIEND());
          this.emit("end");
        }.bind(this)
      );
      this._deflate.end(filteredData);
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/sync-inflate.js
var require_sync_inflate = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/sync-inflate.js"(exports, module) {
    "use strict";
    var assert = __require("assert").ok;
    var zlib = __require("zlib");
    var util = __require("util");
    var kMaxLength = __require("buffer").kMaxLength;
    function Inflate(opts) {
      if (!(this instanceof Inflate)) {
        return new Inflate(opts);
      }
      if (opts && opts.chunkSize < zlib.Z_MIN_CHUNK) {
        opts.chunkSize = zlib.Z_MIN_CHUNK;
      }
      zlib.Inflate.call(this, opts);
      this._offset = this._offset === void 0 ? this._outOffset : this._offset;
      this._buffer = this._buffer || this._outBuffer;
      if (opts && opts.maxLength != null) {
        this._maxLength = opts.maxLength;
      }
    }
    function createInflate(opts) {
      return new Inflate(opts);
    }
    function _close(engine, callback) {
      if (callback) {
        process.nextTick(callback);
      }
      if (!engine._handle) {
        return;
      }
      engine._handle.close();
      engine._handle = null;
    }
    Inflate.prototype._processChunk = function(chunk, flushFlag, asyncCb) {
      if (typeof asyncCb === "function") {
        return zlib.Inflate._processChunk.call(this, chunk, flushFlag, asyncCb);
      }
      let self = this;
      let availInBefore = chunk && chunk.length;
      let availOutBefore = this._chunkSize - this._offset;
      let leftToInflate = this._maxLength;
      let inOff = 0;
      let buffers = [];
      let nread = 0;
      let error;
      this.on("error", function(err) {
        error = err;
      });
      function handleChunk(availInAfter, availOutAfter) {
        if (self._hadError) {
          return;
        }
        let have = availOutBefore - availOutAfter;
        assert(have >= 0, "have should not go down");
        if (have > 0) {
          let out = self._buffer.slice(self._offset, self._offset + have);
          self._offset += have;
          if (out.length > leftToInflate) {
            out = out.slice(0, leftToInflate);
          }
          buffers.push(out);
          nread += out.length;
          leftToInflate -= out.length;
          if (leftToInflate === 0) {
            return false;
          }
        }
        if (availOutAfter === 0 || self._offset >= self._chunkSize) {
          availOutBefore = self._chunkSize;
          self._offset = 0;
          self._buffer = Buffer.allocUnsafe(self._chunkSize);
        }
        if (availOutAfter === 0) {
          inOff += availInBefore - availInAfter;
          availInBefore = availInAfter;
          return true;
        }
        return false;
      }
      assert(this._handle, "zlib binding closed");
      let res;
      do {
        res = this._handle.writeSync(
          flushFlag,
          chunk,
          // in
          inOff,
          // in_off
          availInBefore,
          // in_len
          this._buffer,
          // out
          this._offset,
          //out_off
          availOutBefore
        );
        res = res || this._writeState;
      } while (!this._hadError && handleChunk(res[0], res[1]));
      if (this._hadError) {
        throw error;
      }
      if (nread >= kMaxLength) {
        _close(this);
        throw new RangeError(
          "Cannot create final Buffer. It would be larger than 0x" + kMaxLength.toString(16) + " bytes"
        );
      }
      let buf = Buffer.concat(buffers, nread);
      _close(this);
      return buf;
    };
    util.inherits(Inflate, zlib.Inflate);
    function zlibBufferSync(engine, buffer) {
      if (typeof buffer === "string") {
        buffer = Buffer.from(buffer);
      }
      if (!(buffer instanceof Buffer)) {
        throw new TypeError("Not a string or buffer");
      }
      let flushFlag = engine._finishFlushFlag;
      if (flushFlag == null) {
        flushFlag = zlib.Z_FINISH;
      }
      return engine._processChunk(buffer, flushFlag);
    }
    function inflateSync(buffer, opts) {
      return zlibBufferSync(new Inflate(opts), buffer);
    }
    module.exports = exports = inflateSync;
    exports.Inflate = Inflate;
    exports.createInflate = createInflate;
    exports.inflateSync = inflateSync;
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/sync-reader.js
var require_sync_reader = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/sync-reader.js"(exports, module) {
    "use strict";
    var SyncReader = module.exports = function(buffer) {
      this._buffer = buffer;
      this._reads = [];
    };
    SyncReader.prototype.read = function(length, callback) {
      this._reads.push({
        length: Math.abs(length),
        // if length < 0 then at most this length
        allowLess: length < 0,
        func: callback
      });
    };
    SyncReader.prototype.process = function() {
      while (this._reads.length > 0 && this._buffer.length) {
        let read = this._reads[0];
        if (this._buffer.length && (this._buffer.length >= read.length || read.allowLess)) {
          this._reads.shift();
          let buf = this._buffer;
          this._buffer = buf.slice(read.length);
          read.func.call(this, buf.slice(0, read.length));
        } else {
          break;
        }
      }
      if (this._reads.length > 0) {
        throw new Error("There are some read requests waitng on finished stream");
      }
      if (this._buffer.length > 0) {
        throw new Error("unrecognised content at end of stream");
      }
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/filter-parse-sync.js
var require_filter_parse_sync = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/filter-parse-sync.js"(exports) {
    "use strict";
    var SyncReader = require_sync_reader();
    var Filter = require_filter_parse();
    exports.process = function(inBuffer, bitmapInfo) {
      let outBuffers = [];
      let reader = new SyncReader(inBuffer);
      let filter = new Filter(bitmapInfo, {
        read: reader.read.bind(reader),
        write: function(bufferPart) {
          outBuffers.push(bufferPart);
        },
        complete: function() {
        }
      });
      filter.start();
      reader.process();
      return Buffer.concat(outBuffers);
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/parser-sync.js
var require_parser_sync = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/parser-sync.js"(exports, module) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = __require("zlib");
    var inflateSync = require_sync_inflate();
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var SyncReader = require_sync_reader();
    var FilterSync = require_filter_parse_sync();
    var Parser = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    module.exports = function(buffer, options) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let err;
      function handleError(_err_) {
        err = _err_;
      }
      let metaData;
      function handleMetaData(_metaData_) {
        metaData = _metaData_;
      }
      function handleTransColor(transColor) {
        metaData.transColor = transColor;
      }
      function handlePalette(palette) {
        metaData.palette = palette;
      }
      function handleSimpleTransparency() {
        metaData.alpha = true;
      }
      let gamma;
      function handleGamma(_gamma_) {
        gamma = _gamma_;
      }
      let inflateDataList = [];
      function handleInflateData(inflatedData2) {
        inflateDataList.push(inflatedData2);
      }
      let reader = new SyncReader(buffer);
      let parser = new Parser(options, {
        read: reader.read.bind(reader),
        error: handleError,
        metadata: handleMetaData,
        gamma: handleGamma,
        palette: handlePalette,
        transColor: handleTransColor,
        inflateData: handleInflateData,
        simpleTransparency: handleSimpleTransparency
      });
      parser.start();
      reader.process();
      if (err) {
        throw err;
      }
      let inflateData = Buffer.concat(inflateDataList);
      inflateDataList.length = 0;
      let inflatedData;
      if (metaData.interlace) {
        inflatedData = zlib.inflateSync(inflateData);
      } else {
        let rowSize = (metaData.width * metaData.bpp * metaData.depth + 7 >> 3) + 1;
        let imageSize = rowSize * metaData.height;
        inflatedData = inflateSync(inflateData, {
          chunkSize: imageSize,
          maxLength: imageSize
        });
      }
      inflateData = null;
      if (!inflatedData || !inflatedData.length) {
        throw new Error("bad png - invalid inflate data response");
      }
      let unfilteredData = FilterSync.process(inflatedData, metaData);
      inflateData = null;
      let bitmapData = bitmapper.dataToBitMap(unfilteredData, metaData);
      unfilteredData = null;
      let normalisedBitmapData = formatNormaliser(
        bitmapData,
        metaData,
        options.skipRescale
      );
      metaData.data = normalisedBitmapData;
      metaData.gamma = gamma || 0;
      return metaData;
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/packer-sync.js
var require_packer_sync = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/packer-sync.js"(exports, module) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = __require("zlib");
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var constants = require_constants();
    var Packer = require_packer();
    module.exports = function(metaData, opt) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let options = opt || {};
      let packer = new Packer(options);
      let chunks = [];
      chunks.push(Buffer.from(constants.PNG_SIGNATURE));
      chunks.push(packer.packIHDR(metaData.width, metaData.height));
      if (metaData.gamma) {
        chunks.push(packer.packGAMA(metaData.gamma));
      }
      let filteredData = packer.filterData(
        metaData.data,
        metaData.width,
        metaData.height
      );
      let compressedData = zlib.deflateSync(
        filteredData,
        packer.getDeflateOptions()
      );
      filteredData = null;
      if (!compressedData || !compressedData.length) {
        throw new Error("bad png - invalid compressed data response");
      }
      chunks.push(packer.packIDAT(compressedData));
      chunks.push(packer.packIEND());
      return Buffer.concat(chunks);
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/png-sync.js
var require_png_sync = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/png-sync.js"(exports) {
    "use strict";
    var parse = require_parser_sync();
    var pack = require_packer_sync();
    exports.read = function(buffer, options) {
      return parse(buffer, options || {});
    };
    exports.write = function(png, options) {
      return pack(png, options);
    };
  }
});

// ../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/png.js
var require_png = __commonJS({
  "../../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/png.js"(exports) {
    "use strict";
    var util = __require("util");
    var Stream = __require("stream");
    var Parser = require_parser_async();
    var Packer = require_packer_async();
    var PNGSync = require_png_sync();
    var PNG3 = exports.PNG = function(options) {
      Stream.call(this);
      options = options || {};
      this.width = options.width | 0;
      this.height = options.height | 0;
      this.data = this.width > 0 && this.height > 0 ? Buffer.alloc(4 * this.width * this.height) : null;
      if (options.fill && this.data) {
        this.data.fill(0);
      }
      this.gamma = 0;
      this.readable = this.writable = true;
      this._parser = new Parser(options);
      this._parser.on("error", this.emit.bind(this, "error"));
      this._parser.on("close", this._handleClose.bind(this));
      this._parser.on("metadata", this._metadata.bind(this));
      this._parser.on("gamma", this._gamma.bind(this));
      this._parser.on(
        "parsed",
        function(data) {
          this.data = data;
          this.emit("parsed", data);
        }.bind(this)
      );
      this._packer = new Packer(options);
      this._packer.on("data", this.emit.bind(this, "data"));
      this._packer.on("end", this.emit.bind(this, "end"));
      this._parser.on("close", this._handleClose.bind(this));
      this._packer.on("error", this.emit.bind(this, "error"));
    };
    util.inherits(PNG3, Stream);
    PNG3.sync = PNGSync;
    PNG3.prototype.pack = function() {
      if (!this.data || !this.data.length) {
        this.emit("error", "No data provided");
        return this;
      }
      process.nextTick(
        function() {
          this._packer.pack(this.data, this.width, this.height, this.gamma);
        }.bind(this)
      );
      return this;
    };
    PNG3.prototype.parse = function(data, callback) {
      if (callback) {
        let onParsed, onError;
        onParsed = function(parsedData) {
          this.removeListener("error", onError);
          this.data = parsedData;
          callback(null, this);
        }.bind(this);
        onError = function(err) {
          this.removeListener("parsed", onParsed);
          callback(err, null);
        }.bind(this);
        this.once("parsed", onParsed);
        this.once("error", onError);
      }
      this.end(data);
      return this;
    };
    PNG3.prototype.write = function(data) {
      this._parser.write(data);
      return true;
    };
    PNG3.prototype.end = function(data) {
      this._parser.end(data);
    };
    PNG3.prototype._metadata = function(metadata) {
      this.width = metadata.width;
      this.height = metadata.height;
      this.emit("metadata", metadata);
    };
    PNG3.prototype._gamma = function(gamma) {
      this.gamma = gamma;
    };
    PNG3.prototype._handleClose = function() {
      if (!this._parser.writable && !this._packer.readable) {
        this.emit("close");
      }
    };
    PNG3.bitblt = function(src, dst, srcX, srcY, width, height, deltaX, deltaY) {
      srcX |= 0;
      srcY |= 0;
      width |= 0;
      height |= 0;
      deltaX |= 0;
      deltaY |= 0;
      if (srcX > src.width || srcY > src.height || srcX + width > src.width || srcY + height > src.height) {
        throw new Error("bitblt reading outside image");
      }
      if (deltaX > dst.width || deltaY > dst.height || deltaX + width > dst.width || deltaY + height > dst.height) {
        throw new Error("bitblt writing outside image");
      }
      for (let y = 0; y < height; y++) {
        src.data.copy(
          dst.data,
          (deltaY + y) * dst.width + deltaX << 2,
          (srcY + y) * src.width + srcX << 2,
          (srcY + y) * src.width + srcX + width << 2
        );
      }
    };
    PNG3.prototype.bitblt = function(dst, srcX, srcY, width, height, deltaX, deltaY) {
      PNG3.bitblt(this, dst, srcX, srcY, width, height, deltaX, deltaY);
      return this;
    };
    PNG3.adjustGamma = function(src) {
      if (src.gamma) {
        for (let y = 0; y < src.height; y++) {
          for (let x = 0; x < src.width; x++) {
            let idx = src.width * y + x << 2;
            for (let i = 0; i < 3; i++) {
              let sample = src.data[idx + i] / 255;
              sample = Math.pow(sample, 1 / 2.2 / src.gamma);
              src.data[idx + i] = Math.round(sample * 255);
            }
          }
        }
        src.gamma = 0;
      }
    };
    PNG3.prototype.adjustGamma = function() {
      PNG3.adjustGamma(this);
    };
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/math.js
var require_math = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/math.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.covariance = exports.variance = exports.mean2d = exports.square2d = exports.multiply2d = exports.divide2d = exports.subtract2d = exports.add2d = exports.sum2d = exports.floor = exports.sum = exports.average = void 0;
    function average(xn) {
      return sum(xn) / xn.length;
    }
    exports.average = average;
    function sum(xn) {
      var out = 0;
      for (var x = 0; x < xn.length; x++) {
        out += xn[x];
      }
      return out;
    }
    exports.sum = sum;
    function floor(xn) {
      var out = new Array(xn.length);
      for (var x = 0; x < xn.length; x++) {
        out[x] = Math.floor(xn[x]);
      }
      return out;
    }
    exports.floor = floor;
    function sum2d(_a) {
      var data = _a.data;
      var out = 0;
      for (var x = 0; x < data.length; x++) {
        out += data[x];
      }
      return out;
    }
    exports.sum2d = sum2d;
    function add2dMx(_a, _b) {
      var ref1 = _a.data, width = _a.width, height = _a.height;
      var ref2 = _b.data;
      var data = new Array(ref1.length);
      for (var x = 0; x < height; x++) {
        var offset = x * width;
        for (var y = 0; y < width; y++) {
          data[offset + y] = ref1[offset + y] + ref2[offset + y];
        }
      }
      return {
        data,
        width,
        height
      };
    }
    function subtract2dMx(_a, _b) {
      var ref1 = _a.data, width = _a.width, height = _a.height;
      var ref2 = _b.data;
      var data = new Array(ref1.length);
      for (var x = 0; x < height; x++) {
        var offset = x * width;
        for (var y = 0; y < width; y++) {
          data[offset + y] = ref1[offset + y] - ref2[offset + y];
        }
      }
      return {
        data,
        width,
        height
      };
    }
    function add2dScalar(_a, increase) {
      var ref = _a.data, width = _a.width, height = _a.height;
      var data = new Array(ref.length);
      for (var x = 0; x < ref.length; x++) {
        data[x] = ref[x] + increase;
      }
      return {
        data,
        width,
        height
      };
    }
    function add2d(A, increase) {
      if (typeof increase === "number") {
        return add2dScalar(A, increase);
      }
      return add2dMx(A, increase);
    }
    exports.add2d = add2d;
    function subtract2d(A, decrease) {
      if (typeof decrease === "number") {
        return add2dScalar(A, -decrease);
      }
      return subtract2dMx(A, decrease);
    }
    exports.subtract2d = subtract2d;
    function divide2dScalar(_a, divisor) {
      var ref = _a.data, width = _a.width, height = _a.height;
      var data = new Array(ref.length);
      for (var x = 0; x < ref.length; x++) {
        data[x] = ref[x] / divisor;
      }
      return {
        data,
        width,
        height
      };
    }
    function divide2dMx(_a, _b) {
      var ref1 = _a.data, width = _a.width, height = _a.height;
      var ref2 = _b.data;
      var data = new Array(ref1.length);
      for (var x = 0; x < ref1.length; x++) {
        data[x] = ref1[x] / ref2[x];
      }
      return {
        data,
        width,
        height
      };
    }
    function divide2d(A, divisor) {
      if (typeof divisor === "number") {
        return divide2dScalar(A, divisor);
      }
      return divide2dMx(A, divisor);
    }
    exports.divide2d = divide2d;
    function multiply2dScalar(_a, multiplier) {
      var ref = _a.data, width = _a.width, height = _a.height;
      var data = new Array(ref.length);
      for (var x = 0; x < ref.length; x++) {
        data[x] = ref[x] * multiplier;
      }
      return {
        data,
        width,
        height
      };
    }
    function multiply2dMx(_a, _b) {
      var ref1 = _a.data, width = _a.width, height = _a.height;
      var ref2 = _b.data;
      var data = new Array(ref1.length);
      for (var x = 0; x < ref1.length; x++) {
        data[x] = ref1[x] * ref2[x];
      }
      return {
        data,
        width,
        height
      };
    }
    function multiply2d(A, multiplier) {
      if (typeof multiplier === "number") {
        return multiply2dScalar(A, multiplier);
      }
      return multiply2dMx(A, multiplier);
    }
    exports.multiply2d = multiply2d;
    function square2d(A) {
      return multiply2d(A, A);
    }
    exports.square2d = square2d;
    function mean2d(A) {
      return sum2d(A) / A.data.length;
    }
    exports.mean2d = mean2d;
    function variance(values, avg) {
      if (avg === void 0) {
        avg = average(values);
      }
      var varx = 0;
      var i = values.length;
      while (i--) {
        varx += Math.pow(values[i] - avg, 2);
      }
      return varx / values.length;
    }
    exports.variance = variance;
    function covariance(values1, values2, average1, average2) {
      if (average1 === void 0) {
        average1 = average(values1);
      }
      if (average2 === void 0) {
        average2 = average(values2);
      }
      var cov = 0;
      var i = values1.length;
      while (i--) {
        cov += (values1[i] - average1) * (values2[i] - average2);
      }
      return cov / values1.length;
    }
    exports.covariance = covariance;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/internal/numbers.js
var require_numbers = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/internal/numbers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.numbers = void 0;
    function numbers(height, width, num) {
      var size = width * height;
      var data = new Array(size);
      for (var x = 0; x < size; x++) {
        data[x] = num;
      }
      return {
        data,
        width,
        height
      };
    }
    exports.numbers = numbers;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/ones.js
var require_ones = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/ones.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ones = void 0;
    var numbers_1 = require_numbers();
    function ones(height, width) {
      if (width === void 0) {
        width = height;
      }
      return numbers_1.numbers(height, width, 1);
    }
    exports.ones = ones;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/sub.js
var require_sub = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/sub.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sub = void 0;
    function sub(_a, x, height, y, width) {
      var ref = _a.data, refWidth = _a.width;
      var data = new Array(width * height);
      for (var i = 0; i < height; i++) {
        for (var j = 0; j < width; j++) {
          data[i * width + j] = ref[(y + i) * refWidth + x + j];
        }
      }
      return {
        data,
        width,
        height
      };
    }
    exports.sub = sub;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/zeros.js
var require_zeros = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/zeros.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.zeros = void 0;
    var numbers_1 = require_numbers();
    function zeros(height, width) {
      if (width === void 0) {
        width = height;
      }
      return numbers_1.numbers(height, width, 0);
    }
    exports.zeros = zeros;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/conv2.js
var require_conv2 = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/conv2.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.conv2 = void 0;
    var math_1 = require_math();
    var ones_1 = require_ones();
    var sub_1 = require_sub();
    var zeros_1 = require_zeros();
    function mxConv2(_a, b, shape) {
      var ref = _a.data, refWidth = _a.width, refHeight = _a.height;
      if (shape === void 0) {
        shape = "full";
      }
      var cWidth = refWidth + b.width - 1;
      var cHeight = refHeight + b.height - 1;
      var data = zeros_1.zeros(cHeight, cWidth).data;
      for (var r1 = 0; r1 < b.height; r1++) {
        for (var c1 = 0; c1 < b.width; c1++) {
          var br1c1 = b.data[r1 * b.width + c1];
          if (br1c1) {
            for (var i = 0; i < refHeight; i++) {
              for (var j = 0; j < refWidth; j++) {
                data[(i + r1) * cWidth + j + c1] += ref[i * refWidth + j] * br1c1;
              }
            }
          }
        }
      }
      var c = {
        data,
        width: cWidth,
        height: cHeight
      };
      return reshape(c, shape, refHeight, b.height, refWidth, b.width);
    }
    function boxConv(a, _a, shape) {
      var data = _a.data, width = _a.width, height = _a.height;
      if (shape === void 0) {
        shape = "full";
      }
      var b1 = ones_1.ones(height, 1);
      var b2 = ones_1.ones(1, width);
      var out = convn(a, b1, b2, shape);
      return math_1.multiply2d(out, data[0]);
    }
    function isBoxKernel(_a) {
      var data = _a.data;
      var expected = data[0];
      for (var i = 1; i < data.length; i++) {
        if (data[i] !== expected) {
          return false;
        }
      }
      return true;
    }
    function convn(a, b1, b2, shape) {
      if (shape === void 0) {
        shape = "full";
      }
      var mb = Math.max(b1.height, b1.width);
      var nb = Math.max(b2.height, b2.width);
      var temp = mxConv2(a, b1, "full");
      var c = mxConv2(temp, b2, "full");
      return reshape(c, shape, a.height, mb, a.width, nb);
    }
    function reshape(c, shape, ma, mb, na, nb) {
      if (shape === "full") {
        return c;
      } else if (shape === "same") {
        var rowStart = Math.ceil((c.height - ma) / 2);
        var colStart = Math.ceil((c.width - na) / 2);
        return sub_1.sub(c, rowStart, ma, colStart, na);
      }
      return sub_1.sub(c, mb - 1, ma - mb + 1, nb - 1, na - nb + 1);
    }
    function conv2() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      if (args[2] && args[2].data) {
        return convn.apply(void 0, args);
      } else if (isBoxKernel(args[1])) {
        return boxConv.apply(void 0, args);
      }
      return mxConv2.apply(void 0, args);
    }
    exports.conv2 = conv2;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/filter2.js
var require_filter2 = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/filter2.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.filter2 = void 0;
    var conv2_1 = require_conv2();
    function rotate1802d(_a) {
      var ref = _a.data, width = _a.width, height = _a.height;
      var data = new Array(ref.length);
      for (var i = 0; i < height; i++) {
        for (var j = 0; j < width; j++) {
          data[i * width + j] = ref[(height - 1 - i) * width + width - 1 - j];
        }
      }
      return {
        data,
        width,
        height
      };
    }
    function filter2(h, X, shape) {
      if (shape === void 0) {
        shape = "same";
      }
      return conv2_1.conv2(X, rotate1802d(h), shape);
    }
    exports.filter2 = filter2;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/fspecial.js
var require_fspecial = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/fspecial.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.fspecial = void 0;
    var math_1 = require_math();
    function rangeSquare2d(length) {
      var size = length * 2 + 1;
      var data = new Array(Math.pow(size, 2));
      for (var x = 0; x < size; x++) {
        for (var y = 0; y < size; y++) {
          data[x * size + y] = Math.pow(x - length, 2) + Math.pow(y - length, 2);
        }
      }
      return {
        data,
        width: size,
        height: size
      };
    }
    function gaussianFilter2d(_a, \u03C3) {
      var ref = _a.data, width = _a.width, height = _a.height;
      var data = new Array(ref.length);
      for (var x = 0; x < ref.length; x++) {
        data[x] = Math.exp(-ref[x] / (2 * Math.pow(\u03C3, 2)));
      }
      return {
        data,
        width,
        height
      };
    }
    function fspecial(_type, hsize, \u03C3) {
      if (hsize === void 0) {
        hsize = 3;
      }
      if (\u03C3 === void 0) {
        \u03C3 = 1.5;
      }
      hsize = (hsize - 1) / 2;
      var pos = rangeSquare2d(hsize);
      var gauss = gaussianFilter2d(pos, \u03C3);
      var total = math_1.sum2d(gauss);
      return math_1.divide2d(gauss, total);
    }
    exports.fspecial = fspecial;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/mod.js
var require_mod = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/mod.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.mod = void 0;
    function mod(x, y) {
      return x - y * Math.floor(x / y);
    }
    exports.mod = mod;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/padarray.js
var require_padarray = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/padarray.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.padarray = void 0;
    var mod_1 = require_mod();
    function mirrorHorizonal(_a) {
      var ref = _a.data, width = _a.width, height = _a.height;
      var data = new Array(ref.length);
      for (var x = 0; x < height; x++) {
        for (var y = 0; y < width; y++) {
          data[x * width + y] = ref[x * width + width - 1 - y];
        }
      }
      return {
        data,
        width,
        height
      };
    }
    function mirrorVertical(_a) {
      var ref = _a.data, width = _a.width, height = _a.height;
      var data = new Array(ref.length);
      for (var x = 0; x < height; x++) {
        for (var y = 0; y < width; y++) {
          data[x * width + y] = ref[(height - 1 - x) * width + y];
        }
      }
      return {
        data,
        width,
        height
      };
    }
    function concatHorizontal(A, B) {
      var width = A.width + B.width;
      var data = new Array(A.height * width);
      for (var x = 0; x < A.height; x++) {
        for (var y = 0; y < A.width; y++) {
          data[x * width + y] = A.data[x * A.width + y];
        }
        for (var y = 0; y < B.width; y++) {
          data[x * width + y + A.width] = B.data[x * B.width + y];
        }
      }
      return {
        data,
        width,
        height: A.height
      };
    }
    function concatVertical(A, B) {
      return {
        data: A.data.concat(B.data),
        height: A.height + B.height,
        width: A.width
      };
    }
    function padHorizontal(A, pad) {
      var width = A.width + 2 * pad;
      var data = new Array(width * A.height);
      var mirrored = concatHorizontal(A, mirrorHorizonal(A));
      for (var x = 0; x < A.height; x++) {
        for (var y = -pad; y < A.width + pad; y++) {
          data[x * width + y + pad] = mirrored.data[x * mirrored.width + mod_1.mod(y, mirrored.width)];
        }
      }
      return {
        data,
        width,
        height: A.height
      };
    }
    function padVertical(A, pad) {
      var mirrored = concatVertical(A, mirrorVertical(A));
      var height = A.height + pad * 2;
      var data = new Array(A.width * height);
      for (var x = -pad; x < A.height + pad; x++) {
        for (var y = 0; y < A.width; y++) {
          data[(x + pad) * A.width + y] = mirrored.data[mod_1.mod(x, mirrored.height) * A.width + y];
        }
      }
      return {
        data,
        width: A.width,
        height
      };
    }
    function fastPadding(A, _a) {
      var padHeight = _a[0], padWidth = _a[1];
      var width = A.width + padWidth * 2;
      var height = A.height + padHeight * 2;
      var data = new Array(width * height);
      for (var x = -padHeight; x < 0; x++) {
        for (var y = -padWidth; y < 0; y++) {
          data[(x + padHeight) * width + y + padWidth] = A.data[(Math.abs(x) - 1) * A.width + Math.abs(y) - 1];
        }
        for (var y = 0; y < A.width; y++) {
          data[(x + padHeight) * width + y + padWidth] = A.data[(Math.abs(x) - 1) * A.width + y];
        }
        for (var y = A.width; y < A.width + padWidth; y++) {
          data[(x + padHeight) * width + y + padWidth] = A.data[(Math.abs(x) - 1) * A.width + 2 * A.width - y - 1];
        }
      }
      for (var x = 0; x < A.height; x++) {
        for (var y = -padWidth; y < 0; y++) {
          data[(x + padHeight) * width + y + padWidth] = A.data[x * A.width + Math.abs(y) - 1];
        }
        for (var y = 0; y < A.width; y++) {
          data[(x + padHeight) * width + y + padWidth] = A.data[x * A.width + y];
        }
        for (var y = A.width; y < A.width + padWidth; y++) {
          data[(x + padHeight) * width + y + padWidth] = A.data[x * A.width + 2 * A.width - y - 1];
        }
      }
      for (var x = A.height; x < A.height + padHeight; x++) {
        for (var y = -padWidth; y < 0; y++) {
          data[(x + padHeight) * width + y + padWidth] = A.data[(2 * A.height - x - 1) * A.width + Math.abs(y) - 1];
        }
        for (var y = 0; y < A.width; y++) {
          data[(x + padHeight) * width + y + padWidth] = A.data[(2 * A.height - x - 1) * A.width + y];
        }
        for (var y = A.width; y < A.width + padWidth; y++) {
          data[(x + padHeight) * width + y + padWidth] = A.data[(2 * A.height - x - 1) * A.width + 2 * A.width - y - 1];
        }
      }
      return {
        data,
        width,
        height
      };
    }
    function padarray(A, _a, _padval, _direction) {
      var padHeight = _a[0], padWidth = _a[1];
      if (A.height >= padHeight && A.width >= padWidth) {
        return fastPadding(A, [padHeight, padWidth]);
      }
      return padVertical(padHorizontal(A, padWidth), padHeight);
    }
    exports.padarray = padarray;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/imfilter.js
var require_imfilter = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/imfilter.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.imfilter = void 0;
    var mod_1 = require_mod();
    var padarray_1 = require_padarray();
    var math_1 = require_math();
    var filter2_1 = require_filter2();
    function padMatrix(A, frows, fcols, pad) {
      A = padarray_1.padarray(A, math_1.floor([frows / 2, fcols / 2]), pad);
      if (mod_1.mod(frows, 2) === 0) {
        A.data = A.data.slice(0, -A.width);
        A.height--;
      }
      if (mod_1.mod(fcols, 2) === 0) {
        var data = [];
        for (var x = 0; x < A.data.length; x++) {
          if ((x + 1) % A.width !== 0) {
            data.push(A.data[x]);
          }
        }
        A.data = data;
        A.width--;
      }
      return A;
    }
    function getConv2Size(resSize) {
      if (resSize === "same") {
        resSize = "valid";
      }
      return resSize;
    }
    function imfilter(A, f, pad, resSize) {
      if (pad === void 0) {
        pad = "symmetric";
      }
      if (resSize === void 0) {
        resSize = "same";
      }
      A = padMatrix(A, f.width, f.height, pad);
      resSize = getConv2Size(resSize);
      return filter2_1.filter2(f, A, resSize);
    }
    exports.imfilter = imfilter;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/normpdf.js
var require_normpdf = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/normpdf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.normpdf = void 0;
    function normpdf(_a, \u00B5, \u03C3) {
      var ref = _a.data, width = _a.width, height = _a.height;
      if (\u00B5 === void 0) {
        \u00B5 = 0;
      }
      if (\u03C3 === void 0) {
        \u03C3 = 1;
      }
      var SQ2PI = 2.5066282746310007;
      var data = new Array(ref.length);
      for (var i = 0; i < ref.length; i++) {
        var z = (ref[i] - \u00B5) / \u03C3;
        data[i] = Math.exp(-Math.pow(z, 2) / 2) / (\u03C3 * SQ2PI);
      }
      return {
        data,
        width,
        height
      };
    }
    exports.normpdf = normpdf;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/rgb2gray.js
var require_rgb2gray = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/rgb2gray.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.rgb2grayInteger = exports.rgb2gray = void 0;
    function rgb2gray(_a) {
      var d = _a.data, width = _a.width, height = _a.height;
      var uint8Array = new Uint8Array(width * height);
      for (var i = 0; i < d.length; i += 4) {
        var grayIndex = i / 4;
        uint8Array[grayIndex] = 0.29894 * d[i] + 0.58704 * d[i + 1] + 0.11402 * d[i + 2] + 0.5;
      }
      return {
        data: Array.from(uint8Array),
        width,
        height
      };
    }
    exports.rgb2gray = rgb2gray;
    function rgb2grayInteger(_a) {
      var d = _a.data, width = _a.width, height = _a.height;
      var array = new Array(width * height);
      for (var i = 0; i < d.length; i += 4) {
        var grayIndex = i / 4;
        array[grayIndex] = 77 * d[i] + 150 * d[i + 1] + 29 * d[i + 2] + 128 >> 8;
      }
      return {
        data: array,
        width,
        height
      };
    }
    exports.rgb2grayInteger = rgb2grayInteger;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/skip2d.js
var require_skip2d = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/skip2d.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.skip2d = void 0;
    function skip2d(A, _a, _b) {
      var startRow = _a[0], everyRow = _a[1], endRow = _a[2];
      var startCol = _b[0], everyCol = _b[1], endCol = _b[2];
      var width = Math.ceil((endCol - startCol) / everyCol);
      var height = Math.ceil((endRow - startRow) / everyRow);
      var data = new Array(width * height);
      for (var i = 0; i < height; i++) {
        for (var j = 0; j < width; j++) {
          var Ai = startRow + i * everyRow;
          var Aj = startCol + j * everyCol;
          data[i * width + j] = A.data[Ai * A.width + Aj];
        }
      }
      return {
        data,
        width,
        height
      };
    }
    exports.skip2d = skip2d;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/transpose.js
var require_transpose = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/transpose.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.transpose = void 0;
    function transpose(_a) {
      var ref = _a.data, width = _a.width, height = _a.height;
      var data = new Array(width * height);
      for (var i = 0; i < height; i++) {
        for (var j = 0; j < width; j++) {
          data[j * height + i] = ref[i * width + j];
        }
      }
      return {
        data,
        height: width,
        width: height
      };
    }
    exports.transpose = transpose;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/index.js
var require_matlab = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/matlab/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      Object.defineProperty(o, k2, { enumerable: true, get: function() {
        return m[k];
      } });
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(require_conv2(), exports);
    __exportStar(require_filter2(), exports);
    __exportStar(require_fspecial(), exports);
    __exportStar(require_imfilter(), exports);
    __exportStar(require_normpdf(), exports);
    __exportStar(require_ones(), exports);
    __exportStar(require_padarray(), exports);
    __exportStar(require_rgb2gray(), exports);
    __exportStar(require_skip2d(), exports);
    __exportStar(require_sub(), exports);
    __exportStar(require_transpose(), exports);
    __exportStar(require_zeros(), exports);
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/ssim.js
var require_ssim = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/ssim.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ssim = void 0;
    var math_1 = require_math();
    var matlab_1 = require_matlab();
    function ssim(pixels1, pixels2, options) {
      var w = matlab_1.normpdf(getRange(options.windowSize), 0, 1.5);
      var L = Math.pow(2, options.bitDepth) - 1;
      var c1 = Math.pow(options.k1 * L, 2);
      var c2 = Math.pow(options.k2 * L, 2);
      w = math_1.divide2d(w, math_1.sum2d(w));
      var wt = matlab_1.transpose(w);
      var \u03BC1 = matlab_1.conv2(pixels1, w, wt, "valid");
      var \u03BC2 = matlab_1.conv2(pixels2, w, wt, "valid");
      var \u03BC1Sq = math_1.square2d(\u03BC1);
      var \u03BC2Sq = math_1.square2d(\u03BC2);
      var \u03BC12 = math_1.multiply2d(\u03BC1, \u03BC2);
      var pixels1Sq = math_1.square2d(pixels1);
      var pixels2Sq = math_1.square2d(pixels2);
      var \u03C31Sq = math_1.subtract2d(matlab_1.conv2(pixels1Sq, w, wt, "valid"), \u03BC1Sq);
      var \u03C32Sq = math_1.subtract2d(matlab_1.conv2(pixels2Sq, w, wt, "valid"), \u03BC2Sq);
      var \u03C312 = math_1.subtract2d(matlab_1.conv2(math_1.multiply2d(pixels1, pixels2), w, wt, "valid"), \u03BC12);
      if (c1 > 0 && c2 > 0) {
        return genSSIM(\u03BC12, \u03C312, \u03BC1Sq, \u03BC2Sq, \u03C31Sq, \u03C32Sq, c1, c2);
      }
      return genUQI(\u03BC12, \u03C312, \u03BC1Sq, \u03BC2Sq, \u03C31Sq, \u03C32Sq);
    }
    exports.ssim = ssim;
    function getRange(size) {
      var offset = Math.floor(size / 2);
      var data = new Array(offset * 2 + 1);
      for (var x = -offset; x <= offset; x++) {
        data[x + offset] = Math.abs(x);
      }
      return {
        data,
        width: data.length,
        height: 1
      };
    }
    function genSSIM(\u03BC12, \u03C312, \u03BC1Sq, \u03BC2Sq, \u03C31Sq, \u03C32Sq, c1, c2) {
      var num1 = math_1.add2d(math_1.multiply2d(\u03BC12, 2), c1);
      var num2 = math_1.add2d(math_1.multiply2d(\u03C312, 2), c2);
      var denom1 = math_1.add2d(math_1.add2d(\u03BC1Sq, \u03BC2Sq), c1);
      var denom2 = math_1.add2d(math_1.add2d(\u03C31Sq, \u03C32Sq), c2);
      return math_1.divide2d(math_1.multiply2d(num1, num2), math_1.multiply2d(denom1, denom2));
    }
    function genUQI(\u03BC12, \u03C312, \u03BC1Sq, \u03BC2Sq, \u03C31Sq, \u03C32Sq) {
      var numerator1 = math_1.multiply2d(\u03BC12, 2);
      var numerator2 = math_1.multiply2d(\u03C312, 2);
      var denominator1 = math_1.add2d(\u03BC1Sq, \u03BC2Sq);
      var denominator2 = math_1.add2d(\u03C31Sq, \u03C32Sq);
      return math_1.divide2d(math_1.multiply2d(numerator1, numerator2), math_1.multiply2d(denominator1, denominator2));
    }
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/originalSsim.js
var require_originalSsim = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/originalSsim.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.originalSsim = void 0;
    var math_1 = require_math();
    var matlab_1 = require_matlab();
    function originalSsim(pixels1, pixels2, options) {
      var w = matlab_1.fspecial("gaussian", options.windowSize, 1.5);
      var L = Math.pow(2, options.bitDepth) - 1;
      var c1 = Math.pow(options.k1 * L, 2);
      var c2 = Math.pow(options.k2 * L, 2);
      w = math_1.divide2d(w, math_1.sum2d(w));
      var \u03BC1 = matlab_1.filter2(w, pixels1, "valid");
      var \u03BC2 = matlab_1.filter2(w, pixels2, "valid");
      var \u03BC1Sq = math_1.square2d(\u03BC1);
      var \u03BC2Sq = math_1.square2d(\u03BC2);
      var \u03BC12 = math_1.multiply2d(\u03BC1, \u03BC2);
      var pixels1Sq = math_1.square2d(pixels1);
      var pixels2Sq = math_1.square2d(pixels2);
      var \u03C31Sq = math_1.subtract2d(matlab_1.filter2(w, pixels1Sq, "valid"), \u03BC1Sq);
      var \u03C32Sq = math_1.subtract2d(matlab_1.filter2(w, pixels2Sq, "valid"), \u03BC2Sq);
      var \u03C312 = math_1.subtract2d(matlab_1.filter2(w, math_1.multiply2d(pixels1, pixels2), "valid"), \u03BC12);
      if (c1 > 0 && c2 > 0) {
        var num1 = math_1.add2d(math_1.multiply2d(\u03BC12, 2), c1);
        var num2 = math_1.add2d(math_1.multiply2d(\u03C312, 2), c2);
        var denom1 = math_1.add2d(math_1.add2d(\u03BC1Sq, \u03BC2Sq), c1);
        var denom2 = math_1.add2d(math_1.add2d(\u03C31Sq, \u03C32Sq), c2);
        return math_1.divide2d(math_1.multiply2d(num1, num2), math_1.multiply2d(denom1, denom2));
      }
      var numerator1 = math_1.multiply2d(\u03BC12, 2);
      var numerator2 = math_1.multiply2d(\u03C312, 2);
      var denominator1 = math_1.add2d(\u03BC1Sq, \u03BC2Sq);
      var denominator2 = math_1.add2d(\u03C31Sq, \u03C32Sq);
      return math_1.divide2d(math_1.multiply2d(numerator1, numerator2), math_1.multiply2d(denominator1, denominator2));
    }
    exports.originalSsim = originalSsim;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/bezkrovnySsim.js
var require_bezkrovnySsim = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/bezkrovnySsim.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.bezkrovnySsim = void 0;
    var math_1 = require_math();
    var matlab_1 = require_matlab();
    function bezkrovnySsim(pixels1, pixels2, options) {
      var windowSize = options.windowSize;
      var width = Math.ceil(pixels1.width / windowSize);
      var height = Math.ceil(pixels1.height / windowSize);
      var data = new Array(width * height);
      var counter = 0;
      for (var y = 0; y < pixels1.height; y += windowSize) {
        for (var x = 0; x < pixels1.width; x += windowSize) {
          var windowWidth = Math.min(windowSize, pixels1.width - x);
          var windowHeight = Math.min(windowSize, pixels1.height - y);
          var values1 = matlab_1.sub(pixels1, x, windowHeight, y, windowWidth);
          var values2 = matlab_1.sub(pixels2, x, windowHeight, y, windowWidth);
          data[counter++] = windowSsim(values1, values2, options);
        }
      }
      return { data, width, height };
    }
    exports.bezkrovnySsim = bezkrovnySsim;
    function windowSsim(_a, _b, _c) {
      var values1 = _a.data;
      var values2 = _b.data;
      var bitDepth = _c.bitDepth, k1 = _c.k1, k2 = _c.k2;
      var L = Math.pow(2, bitDepth) - 1;
      var c1 = Math.pow(k1 * L, 2);
      var c2 = Math.pow(k2 * L, 2);
      var average1 = math_1.average(values1);
      var average2 = math_1.average(values2);
      var \u03C3Sqx = math_1.variance(values1, average1);
      var \u03C3Sqy = math_1.variance(values2, average2);
      var \u03C3xy = math_1.covariance(values1, values2, average1, average2);
      var numerator = (2 * average1 * average2 + c1) * (2 * \u03C3xy + c2);
      var denom1 = Math.pow(average1, 2) + Math.pow(average2, 2) + c1;
      var denom2 = \u03C3Sqx + \u03C3Sqy + c2;
      return numerator / (denom1 * denom2);
    }
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/downsample.js
var require_downsample = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/downsample.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.downsample = void 0;
    var math_1 = require_math();
    var matlab_1 = require_matlab();
    function imageDownsample(pixels, filter, f) {
      var imdown = matlab_1.imfilter(pixels, filter, "symmetric", "same");
      return matlab_1.skip2d(imdown, [0, f, imdown.height], [0, f, imdown.width]);
    }
    function originalDownsample(pixels1, pixels2, maxSize) {
      if (maxSize === void 0) {
        maxSize = 256;
      }
      var factor = Math.min(pixels1.width, pixels2.height) / maxSize;
      var f = Math.round(factor);
      if (f > 1) {
        var lpf = matlab_1.ones(f);
        lpf = math_1.divide2d(lpf, math_1.sum2d(lpf));
        pixels1 = imageDownsample(pixels1, lpf, f);
        pixels2 = imageDownsample(pixels2, lpf, f);
      }
      return [pixels1, pixels2];
    }
    function downsample(pixels, options) {
      if (options.downsample === "original") {
        return originalDownsample(pixels[0], pixels[1], options.maxSize);
      }
      return pixels;
    }
    exports.downsample = downsample;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/defaults.js
var require_defaults = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/defaults.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.defaults = void 0;
    exports.defaults = {
      windowSize: 11,
      k1: 0.01,
      k2: 0.03,
      bitDepth: 8,
      downsample: "original",
      ssim: "weber",
      maxSize: 256,
      rgb2grayVersion: "integer"
    };
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/weberSsim.js
var require_weberSsim = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/weberSsim.js"(exports) {
    "use strict";
    var __assign = exports && exports.__assign || function() {
      __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.weberSsim = exports.windowCovariance = exports.windowVariance = exports.windowSums = exports.windowMatrix = exports.partialSumMatrix2 = exports.partialSumMatrix1 = void 0;
    function edgeHandler(w, h, sumArray, matrixWidth) {
      var rightEdge = sumArray[h * matrixWidth + w + 1];
      var bottomEdge = sumArray[(h + 1) * matrixWidth + w];
      var bottomRightEdge = sumArray[(h + 1) * matrixWidth + w + 1];
      return { rightEdge, bottomEdge, bottomRightEdge };
    }
    function partialSumMatrix1(pixels, f) {
      var width = pixels.width, height = pixels.height, data = pixels.data;
      var matrixWidth = width + 1;
      var matrixHeight = height + 1;
      var sumArray = new Int32Array(matrixWidth * matrixHeight);
      for (var h = height - 1; h >= 0; --h) {
        for (var w = width - 1; w >= 0; --w) {
          var _a = edgeHandler(w, h, sumArray, matrixWidth), rightEdge = _a.rightEdge, bottomEdge = _a.bottomEdge, bottomRightEdge = _a.bottomRightEdge;
          sumArray[h * matrixWidth + w] = f(data[h * width + w], w, h) + rightEdge + bottomEdge - bottomRightEdge;
        }
      }
      return { data: sumArray, height: matrixHeight, width: matrixWidth };
    }
    exports.partialSumMatrix1 = partialSumMatrix1;
    function partialSumMatrix2(pixels1, pixels2, f) {
      var width = pixels1.width, height = pixels1.height, data1 = pixels1.data;
      var data2 = pixels2.data;
      var matrixWidth = width + 1;
      var matrixHeight = height + 1;
      var sumArray = new Int32Array(matrixWidth * matrixHeight);
      for (var h = height - 1; h >= 0; --h) {
        for (var w = width - 1; w >= 0; --w) {
          var _a = edgeHandler(w, h, sumArray, matrixWidth), rightEdge = _a.rightEdge, bottomEdge = _a.bottomEdge, bottomRightEdge = _a.bottomRightEdge;
          var offset = h * width + w;
          sumArray[h * matrixWidth + w] = f(data1[offset], data2[offset], w, h) + rightEdge + bottomEdge - bottomRightEdge;
        }
      }
      return { data: sumArray, height: matrixHeight, width: matrixWidth };
    }
    exports.partialSumMatrix2 = partialSumMatrix2;
    function windowMatrix(sumMatrix, windowSize, divisor) {
      var matrixWidth = sumMatrix.width, matrixHeight = sumMatrix.height, sumArray = sumMatrix.data;
      var imageWidth = matrixWidth - 1;
      var imageHeight = matrixHeight - 1;
      var windowWidth = imageWidth - windowSize + 1;
      var windowHeight = imageHeight - windowSize + 1;
      var windows = new Int32Array(windowWidth * windowHeight);
      for (var h = 0; h < imageHeight; ++h) {
        for (var w = 0; w < imageWidth; ++w) {
          if (w < windowWidth && h < windowHeight) {
            var sum = (
              // value at (w,h)
              sumArray[matrixWidth * h + w] - // value at (w+windowSize,h) == right side
              sumArray[matrixWidth * h + w + windowSize] - // value at (w,h+windowSize) == bottom side
              sumArray[matrixWidth * (h + windowSize) + w] + // value at (w+windowSize, h+windowSize) == bottomRight corner
              sumArray[matrixWidth * (h + windowSize) + w + windowSize]
            );
            windows[h * windowWidth + w] = sum / divisor;
          }
        }
      }
      return { height: windowHeight, width: windowWidth, data: windows };
    }
    exports.windowMatrix = windowMatrix;
    function windowSums(pixels, windowSize) {
      return windowMatrix(partialSumMatrix1(pixels, function(a) {
        return a;
      }), windowSize, 1);
    }
    exports.windowSums = windowSums;
    function windowVariance(pixels, sums, windowSize) {
      var varianceCalculation = function(v) {
        return v * v;
      };
      var windowSquared = windowSize * windowSize;
      var varX = windowMatrix(partialSumMatrix1(pixels, varianceCalculation), windowSize, 1);
      for (var i = 0; i < sums.data.length; ++i) {
        var mean = sums.data[i] / windowSquared;
        var sumSquares = varX.data[i] / windowSquared;
        var squareMeans = mean * mean;
        varX.data[i] = 1024 * (sumSquares - squareMeans);
      }
      return varX;
    }
    exports.windowVariance = windowVariance;
    function windowCovariance(pixels1, pixels2, sums1, sums2, windowSize) {
      var covarianceCalculation = function(a, b) {
        return a * b;
      };
      var windowSquared = windowSize * windowSize;
      var covXY = windowMatrix(partialSumMatrix2(pixels1, pixels2, covarianceCalculation), windowSize, 1);
      for (var i = 0; i < sums1.data.length; ++i) {
        covXY.data[i] = 1024 * (covXY.data[i] / windowSquared - sums1.data[i] / windowSquared * (sums2.data[i] / windowSquared));
      }
      return covXY;
    }
    exports.windowCovariance = windowCovariance;
    function weberSsim(pixels1, pixels2, options) {
      var bitDepth = options.bitDepth, k1 = options.k1, k2 = options.k2, windowSize = options.windowSize;
      var L = Math.pow(2, bitDepth) - 1;
      var c1 = k1 * L * (k1 * L);
      var c2 = k2 * L * (k2 * L);
      var windowSquared = windowSize * windowSize;
      var pixels1Rounded = __assign(__assign({}, pixels1), { data: Int32Array.from(pixels1.data, function(v) {
        return v + 0.5;
      }) });
      var pixels2Rounded = __assign(__assign({}, pixels2), { data: Int32Array.from(pixels2.data, function(v) {
        return v + 0.5;
      }) });
      var sums1 = windowSums(pixels1Rounded, windowSize);
      var variance1 = windowVariance(pixels1Rounded, sums1, windowSize);
      var sums2 = windowSums(pixels2Rounded, windowSize);
      var variance2 = windowVariance(pixels2Rounded, sums2, windowSize);
      var covariance = windowCovariance(pixels1Rounded, pixels2Rounded, sums1, sums2, windowSize);
      var size = sums1.data.length;
      var mssim = 0;
      var ssims = new Array(size);
      for (var i = 0; i < size; ++i) {
        var meanx = sums1.data[i] / windowSquared;
        var meany = sums2.data[i] / windowSquared;
        var varx = variance1.data[i] / 1024;
        var vary = variance2.data[i] / 1024;
        var cov = covariance.data[i] / 1024;
        var na = 2 * meanx * meany + c1;
        var nb = 2 * cov + c2;
        var da = meanx * meanx + meany * meany + c1;
        var db = varx + vary + c2;
        var ssim = na * nb / da / db;
        ssims[i] = ssim;
        if (i == 0) {
          mssim = ssim;
        } else {
          mssim = mssim + (ssim - mssim) / (i + 1);
        }
      }
      return { data: ssims, width: sums1.width, height: sums1.height, mssim };
    }
    exports.weberSsim = weberSsim;
  }
});

// ../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/index.js
var require_dist = __commonJS({
  "../../node_modules/.pnpm/ssim.js@3.5.0/node_modules/ssim.js/dist/index.js"(exports) {
    "use strict";
    var __assign = exports && exports.__assign || function() {
      __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ssim = exports.getOptions = void 0;
    var matlab_1 = require_matlab();
    var math_1 = require_math();
    var ssim_1 = require_ssim();
    var originalSsim_1 = require_originalSsim();
    var bezkrovnySsim_1 = require_bezkrovnySsim();
    var downsample_1 = require_downsample();
    var defaults_1 = require_defaults();
    var weberSsim_1 = require_weberSsim();
    var ssimTargets = {
      fast: ssim_1.ssim,
      original: originalSsim_1.originalSsim,
      bezkrovny: bezkrovnySsim_1.bezkrovnySsim,
      weber: weberSsim_1.weberSsim
    };
    function validateOptions(options) {
      Object.keys(options).forEach(function(option) {
        if (!(option in defaults_1.defaults)) {
          throw new Error('"' + option + '" is not a valid option');
        }
      });
      if ("k1" in options && (typeof options.k1 !== "number" || options.k1 < 0)) {
        throw new Error("Invalid k1 value. Default is " + defaults_1.defaults.k1);
      }
      if ("k2" in options && (typeof options.k2 !== "number" || options.k2 < 0)) {
        throw new Error("Invalid k2 value. Default is " + defaults_1.defaults.k2);
      }
      if (!(options.ssim in ssimTargets)) {
        throw new Error("Invalid ssim option (use: " + Object.keys(ssimTargets).join(", ") + ")");
      }
    }
    function getOptions(userOptions) {
      var options = __assign(__assign({}, defaults_1.defaults), userOptions);
      validateOptions(options);
      return options;
    }
    exports.getOptions = getOptions;
    function validateDimensions(_a) {
      var pixels1 = _a[0], pixels2 = _a[1], options = _a[2];
      if (pixels1.width !== pixels2.width || pixels1.height !== pixels2.height) {
        throw new Error("Image dimensions do not match");
      }
      return [pixels1, pixels2, options];
    }
    function toGrayScale(_a) {
      var pixels1 = _a[0], pixels2 = _a[1], options = _a[2];
      if (options.rgb2grayVersion === "original") {
        return [matlab_1.rgb2gray(pixels1), matlab_1.rgb2gray(pixels2), options];
      } else {
        return [matlab_1.rgb2grayInteger(pixels1), matlab_1.rgb2grayInteger(pixels2), options];
      }
    }
    function toResize(_a) {
      var pixels1 = _a[0], pixels2 = _a[1], options = _a[2];
      var pixels = downsample_1.downsample([pixels1, pixels2], options);
      return [pixels[0], pixels[1], options];
    }
    function comparison(_a) {
      var pixels1 = _a[0], pixels2 = _a[1], options = _a[2];
      return ssimTargets[options.ssim](pixels1, pixels2, options);
    }
    function ssim(image1, image2, userOptions) {
      var start = (/* @__PURE__ */ new Date()).getTime();
      var options = getOptions(userOptions);
      var ssimMap = comparison(toResize(toGrayScale(validateDimensions([image1, image2, options]))));
      var mssim = ssimMap.mssim !== void 0 ? ssimMap.mssim : math_1.mean2d(ssimMap);
      return {
        mssim,
        ssim_map: ssimMap,
        performance: (/* @__PURE__ */ new Date()).getTime() - start
      };
    }
    exports.ssim = ssim;
    exports.default = ssim;
  }
});

// src/verify/cli.ts
import { basename, resolve } from "path";

// src/verify/diff.ts
import { readFile, mkdir, writeFile } from "fs/promises";
import { dirname } from "path";

// ../../node_modules/.pnpm/pixelmatch@7.2.0/node_modules/pixelmatch/index.js
function pixelmatch(img1, img2, output, width, height, options = {}) {
  const {
    threshold = 0.1,
    alpha = 0.1,
    aaColor = [255, 255, 0],
    diffColor = [255, 0, 0],
    checkerboard = true,
    includeAA,
    diffColorAlt,
    diffMask
  } = options;
  if (!isPixelData(img1) || !isPixelData(img2) || output && !isPixelData(output))
    throw new Error("Image data: Uint8Array, Uint8ClampedArray or Buffer expected.");
  if (img1.length !== img2.length || output && output.length !== img1.length)
    throw new Error(`Image sizes do not match. Image 1 size: ${img1.length}, image 2 size: ${img2.length}`);
  if (img1.length !== width * height * 4) throw new Error(`Image data size does not match width/height. Expecting ${width * height * 4}. Got ${img1.length}`);
  const len = width * height;
  const a32 = new Uint32Array(img1.buffer, img1.byteOffset, len);
  const b32 = new Uint32Array(img2.buffer, img2.byteOffset, len);
  let identical = true;
  for (let i = 0; i < len; i++) {
    if (a32[i] !== b32[i]) {
      identical = false;
      break;
    }
  }
  if (identical) {
    if (output && !diffMask) {
      for (let i = 0, pos = 0; i < len; i++, pos += 4) drawGrayPixel(img1, pos, alpha, output);
    }
    return 0;
  }
  const maxDelta = 35215 * threshold * threshold;
  const [aaR, aaG, aaB] = aaColor;
  const [diffR, diffG, diffB] = diffColor;
  const [altR, altG, altB] = diffColorAlt || diffColor;
  let diff = 0;
  for (let i = 0, pos = 0; i < len; i++, pos += 4) {
    const delta = a32[i] === b32[i] ? 0 : colorDelta(img1, img2, pos, pos, checkerboard);
    if (Math.abs(delta) > maxDelta) {
      const x = i % width;
      const y = i / width | 0;
      const isExcludedAA = !includeAA && (antialiased(img1, x, y, width, height, a32, b32, checkerboard) || antialiased(img2, x, y, width, height, b32, a32, checkerboard));
      if (isExcludedAA) {
        if (output && !diffMask) drawPixel(output, pos, aaR, aaG, aaB);
      } else {
        if (output) {
          if (delta < 0) {
            drawPixel(output, pos, altR, altG, altB);
          } else {
            drawPixel(output, pos, diffR, diffG, diffB);
          }
        }
        diff++;
      }
    } else if (output && !diffMask) {
      drawGrayPixel(img1, pos, alpha, output);
    }
  }
  return diff;
}
function isPixelData(arr) {
  return ArrayBuffer.isView(arr) && arr.BYTES_PER_ELEMENT === 1;
}
function antialiased(img, x1, y1, width, height, a32, b32, checkerboard) {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos4 = (y1 * width + x1) * 4;
  const cr = img[pos4];
  const cg = img[pos4 + 1];
  const cb = img[pos4 + 2];
  const ca = img[pos4 + 3];
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0;
  let max = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      const delta = brightnessDelta(img, pos4, (y * width + x) * 4, cr, cg, cb, ca, checkerboard);
      if (delta === 0) {
        zeroes++;
        if (zeroes > 2) return false;
      } else if (delta < min) {
        min = delta;
        minX = x;
        minY = y;
      } else if (delta > max) {
        max = delta;
        maxX = x;
        maxY = y;
      }
    }
  }
  if (min === 0 || max === 0) return false;
  return hasManySiblings(a32, minX, minY, width, height) && hasManySiblings(b32, minX, minY, width, height) || hasManySiblings(a32, maxX, maxY, width, height) && hasManySiblings(b32, maxX, maxY, width, height);
}
function hasManySiblings(img, x1, y1, width, height) {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const val = img[y1 * width + x1];
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      zeroes += +(val === img[y * width + x]);
      if (zeroes > 2) return true;
    }
  }
  return false;
}
function colorDelta(img1, img2, k, m, checkerboard) {
  const r1 = img1[k];
  const g1 = img1[k + 1];
  const b1 = img1[k + 2];
  const a1 = img1[k + 3];
  const r2 = img2[m];
  const g2 = img2[m + 1];
  const b2 = img2[m + 2];
  const a2 = img2[m + 3];
  let dr = r1 - r2;
  let dg = g1 - g2;
  let db = b1 - b2;
  const da = a1 - a2;
  if (a1 < 255 || a2 < 255) {
    let rb = 255, gb = 255, bb = 255;
    if (checkerboard) {
      rb = 48 + 159 * (k % 2);
      gb = 48 + 159 * ((k / 1.618033988749895 | 0) % 2);
      bb = 48 + 159 * ((k / 2.618033988749895 | 0) % 2);
    }
    dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
    dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
    db = (b1 * a1 - b2 * a2 - bb * da) / 255;
  }
  const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
  const i = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
  const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
  const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
  return y > 0 ? -delta : delta;
}
function brightnessDelta(img, k, m, r1, g1, b1, a1, checkerboard) {
  const r2 = img[m];
  const g2 = img[m + 1];
  const b2 = img[m + 2];
  const a2 = img[m + 3];
  let dr = r1 - r2;
  let dg = g1 - g2;
  let db = b1 - b2;
  const da = a1 - a2;
  if (!dr && !dg && !db && !da) return 0;
  if (a1 < 255 || a2 < 255) {
    let rb = 255, gb = 255, bb = 255;
    if (checkerboard) {
      rb = 48 + 159 * (k % 2);
      gb = 48 + 159 * ((k / 1.618033988749895 | 0) % 2);
      bb = 48 + 159 * ((k / 2.618033988749895 | 0) % 2);
    }
    dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
    dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
    db = (b1 * a1 - b2 * a2 - bb * da) / 255;
  }
  return dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
}
function drawPixel(output, pos, r, g, b) {
  output[pos] = r;
  output[pos + 1] = g;
  output[pos + 2] = b;
  output[pos + 3] = 255;
}
function drawGrayPixel(img, i, alpha, output) {
  const val = 255 + (img[i] * 0.29889531 + img[i + 1] * 0.58662247 + img[i + 2] * 0.11448223 - 255) * alpha * img[i + 3] / 255;
  drawPixel(output, i, val, val, val);
}

// src/verify/diff.ts
var import_pngjs = __toESM(require_png(), 1);
var import_ssim = __toESM(require_dist(), 1);
var PIXELMATCH_THRESHOLD = 0.1;
function toRgba(png) {
  return {
    data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
    width: png.width,
    height: png.height
  };
}
async function loadPng(path) {
  return toRgba(import_pngjs.PNG.sync.read(await readFile(path)));
}
function assertSameSize(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}. The calibrated diff requires same-settings captures; resize upstream before diffing.`
    );
  }
}
function computeSsim(a, b) {
  const result = (0, import_ssim.ssim)(
    { data: a.data, width: a.width, height: a.height },
    { data: b.data, width: b.width, height: b.height },
    { ssim: "fast" }
  );
  return roundTo(result.mssim, 4);
}
function diffImages(a, b) {
  assertSameSize(a, b);
  const { width, height } = a;
  const heatmap = new import_pngjs.PNG({ width, height });
  const diffPixels = pixelmatch(a.data, b.data, heatmap.data, width, height, {
    threshold: PIXELMATCH_THRESHOLD,
    includeAA: false,
    alpha: 0.3,
    diffColor: [255, 0, 0]
  });
  const pixelDiffPct = roundTo(diffPixels / (width * height) * 100, 4);
  return {
    pixelDiffPct,
    ssim: computeSsim(a, b),
    width,
    height,
    diffPixels,
    heatmapPng: import_pngjs.PNG.sync.write(heatmap)
  };
}
async function diffFiles(refPath, recPath, opts = {}) {
  const [ref, rec] = await Promise.all([loadPng(refPath), loadPng(recPath)]);
  const result = diffImages(ref, rec);
  if (opts.heatmapPath) {
    await mkdir(dirname(opts.heatmapPath), { recursive: true });
    await writeFile(opts.heatmapPath, result.heatmapPng);
  }
  return result;
}
function roundTo(value, places) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// src/verify/cli.ts
var import_pngjs2 = __toESM(require_png(), 1);

// src/verify/proof.ts
import { mkdir as mkdir2, writeFile as writeFile2 } from "fs/promises";
import { join } from "path";
var STYLE = `
:root{color-scheme:light dark}
body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:24px;background:#0b0d10;color:#e6e9ef}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 10px;color:#9aa4b2}
.sub{color:#9aa4b2;margin:0 0 16px}
.verdict{display:inline-block;padding:6px 14px;border-radius:8px;font-weight:600;letter-spacing:.02em}
.pass{background:#0f3d23;color:#5ee08f;border:1px solid #1d6b3f}
.fail{background:#3d0f14;color:#ff7a85;border:1px solid #6b1d27}
table{border-collapse:collapse;width:100%;margin:8px 0}
td,th{border:1px solid #1f2630;padding:8px 10px;text-align:left;vertical-align:top}
th{color:#9aa4b2;font-weight:600}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:10px 0}
.cell{border:1px solid #1f2630;border-radius:8px;padding:8px;background:#11151b}
.cell h3{margin:0 0 6px;font-size:12px;color:#9aa4b2;font-weight:600}
img{max-width:100%;height:auto;display:block;border-radius:4px;background:#000}
.contact{display:flex;flex-wrap:wrap;gap:4px}.contact img{width:120px}
video{max-width:100%;border-radius:8px;background:#000}
.m{font-variant-numeric:tabular-nums}
.ok{color:#5ee08f}.no{color:#ff7a85}
.note{color:#6b7686;font-size:12px;margin-top:24px;border-top:1px solid #1f2630;padding-top:12px}
.fail-box{background:#1a0e10;border:1px solid #6b1d27;border-radius:8px;padding:12px;margin:10px 0}
`;
var escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
var dataUri = (buffer, mime = "image/png") => `data:${mime};base64,${buffer.toString("base64")}`;
function pairBlock(pair) {
  const metric = pair.pixelDiffPct === void 0 && pair.ssim === void 0 ? "" : `<p class="m">pixelDiff <b class="${pair.pass === false ? "no" : "ok"}">${pair.pixelDiffPct ?? "\u2014"}%</b> &nbsp; SSIM <b>${pair.ssim ?? "\u2014"}</b>` + (pair.pass === void 0 ? "" : ` &nbsp; ${pair.pass ? '<span class="ok">PASS</span>' : '<span class="no">FAIL</span>'}`) + `</p>`;
  const heatmapCell = pair.heatmap ? `<div class="cell"><h3>diff heatmap</h3><img src="${dataUri(pair.heatmap)}"/></div>` : "";
  return `<h2>${escape(pair.label)}</h2>${metric}<div class="grid">
    <div class="cell"><h3>${escape(pair.aCaption ?? "reconstruction")}</h3><img src="${dataUri(pair.a)}"/></div>
    <div class="cell"><h3>${escape(pair.bCaption ?? "ground truth")}</h3><img src="${dataUri(pair.b)}"/></div>
    ${heatmapCell}
  </div>`;
}
function renderProofHtml(opts) {
  const parts = [];
  parts.push(`<h1>${escape(opts.title)}</h1>`);
  if (opts.subtitle) parts.push(`<p class="sub">${escape(opts.subtitle)}</p>`);
  if (opts.verdict) {
    const v = opts.verdict;
    parts.push(
      `<span class="verdict ${v.pass ? "pass" : "fail"}">${v.pass ? "INDISTINGUISHABLE" : "DISTINGUISHABLE"} \u2014 pixelDiff ${v.pixelDiffPct}% (max ${v.thresholds.pixelDiffMax}%), SSIM ${v.ssim} (min ${v.thresholds.ssimMin}), via ${v.reason}</span>`
    );
  }
  if (opts.failure) {
    const f = opts.failure;
    parts.push(
      `<div class="fail-box"><b>Failure detail.</b> ` + [
        f.frameIndex !== void 0 ? `frame #${f.frameIndex}` : "",
        f.selector ? `selector <code>${escape(f.selector)}</code>` : "",
        f.note ? escape(f.note) : ""
      ].filter(Boolean).join(" \xB7 ") + `</div>`
    );
  }
  if (opts.metrics?.length) {
    parts.push(
      `<h2>metrics</h2><table><tr><th>metric</th><th>value</th></tr>` + opts.metrics.map(
        (m) => `<tr><td>${escape(m.label)}</td><td class="m ${m.pass === void 0 ? "" : m.pass ? "ok" : "no"}">${escape(m.value)}</td></tr>`
      ).join("") + `</table>`
    );
  }
  for (const chart of opts.charts ?? []) parts.push(chart);
  for (const pair of opts.pairs ?? []) parts.push(pairBlock(pair));
  if (opts.video) {
    parts.push(
      `<h2>render</h2><video controls autoplay loop muted src="${dataUri(opts.video.data, opts.video.mime)}"></video>`
    );
  }
  if (opts.frames?.length) {
    parts.push(
      `<h2>frame contact-sheet (${opts.frames.length})</h2><div class="contact">` + opts.frames.map((f) => `<img src="${dataUri(f)}"/>`).join("") + `</div>`
    );
  }
  if (opts.note) parts.push(`<p class="note">${escape(opts.note)}</p>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(opts.title)}</title><style>${STYLE}</style></head><body>${parts.join("\n")}</body></html>`;
}
async function writeProof(opts) {
  await mkdir2(opts.outDir, { recursive: true });
  const htmlPath = join(opts.outDir, "index.html");
  await writeFile2(htmlPath, renderProofHtml(opts), "utf8");
  return htmlPath;
}

// src/verify/thresholds.ts
var CALIBRATION_PROVENANCE = "single-rater (jake), provisional \u2014 70 pairs, honesty 3/3, kappa n/a (n=1)";
var PIXEL_DIFF_MAX = 1.82335;
var SSIM_MIN = 0.9905;
function verdict(metrics) {
  const pixelOk = metrics.pixelDiffPct <= PIXEL_DIFF_MAX;
  const ssimOk = metrics.ssim >= SSIM_MIN;
  const reason = pixelOk && ssimOk ? "both" : pixelOk ? "pixelDiff" : ssimOk ? "ssim" : "neither";
  return {
    pass: pixelOk || ssimOk,
    reason,
    primaryMetric: "pixelDiff",
    pixelDiffPct: metrics.pixelDiffPct,
    ssim: metrics.ssim,
    thresholds: { pixelDiffMax: PIXEL_DIFF_MAX, ssimMin: SSIM_MIN },
    provenance: CALIBRATION_PROVENANCE
  };
}

// src/verify/cli.ts
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      flags[arg.slice(2)] = argv[i + 1] ?? "";
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}
async function pngToBuffer(path) {
  const img = await loadPng(path);
  const png = new import_pngjs2.PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  return import_pngjs2.PNG.sync.write(png);
}
async function cmdDiff(positional, flags) {
  const [refPath, recPath] = positional;
  if (!refPath || !recPath) {
    console.error("usage: verify diff <reconstruction.png> <ground-truth.png> [--out <dir>]");
    return 2;
  }
  const result = await diffFiles(resolve(recPath), resolve(refPath));
  const v = verdict(result);
  const line = `${v.pass ? "PASS" : "FAIL"}  pixelDiff=${result.pixelDiffPct}% ssim=${result.ssim}  -> ${v.pass ? "indistinguishable" : "distinguishable"} (gate: <=${v.thresholds.pixelDiffMax}% OR >=${v.thresholds.ssimMin}) [${v.provenance}]`;
  console.log(line);
  if (flags.out) {
    const outDir = resolve(flags.out);
    const [a, b] = await Promise.all([pngToBuffer(resolve(recPath)), pngToBuffer(resolve(refPath))]);
    const htmlPath = await writeProof({
      title: `diff: ${basename(recPath)} vs ${basename(refPath)}`,
      outDir,
      verdict: v,
      pairs: [
        {
          label: "reconstruction vs ground truth",
          a,
          aCaption: basename(recPath),
          b,
          bCaption: basename(refPath),
          heatmap: result.heatmapPng,
          pixelDiffPct: result.pixelDiffPct,
          ssim: result.ssim,
          pass: v.pass
        }
      ],
      note: `Calibration is provisional: ${v.provenance}.`
    });
    console.log(`proof: ${htmlPath}`);
  }
  return v.pass ? 0 : 1;
}
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  switch (command) {
    case "diff":
      return cmdDiff(positional, flags);
    default:
      console.error(`unknown command: ${command ?? "(none)"}
usage: verify diff <a.png> <b.png> [--out <dir>]`);
      return 2;
  }
}
main().then((code) => process.exit(code)).catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(2);
});
