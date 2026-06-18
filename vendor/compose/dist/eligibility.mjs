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
    var PNG2 = exports.PNG = function(options) {
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
    util.inherits(PNG2, Stream);
    PNG2.sync = PNGSync;
    PNG2.prototype.pack = function() {
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
    PNG2.prototype.parse = function(data, callback) {
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
    PNG2.prototype.write = function(data) {
      this._parser.write(data);
      return true;
    };
    PNG2.prototype.end = function(data) {
      this._parser.end(data);
    };
    PNG2.prototype._metadata = function(metadata) {
      this.width = metadata.width;
      this.height = metadata.height;
      this.emit("metadata", metadata);
    };
    PNG2.prototype._gamma = function(gamma) {
      this.gamma = gamma;
    };
    PNG2.prototype._handleClose = function() {
      if (!this._parser.writable && !this._packer.readable) {
        this.emit("close");
      }
    };
    PNG2.bitblt = function(src, dst, srcX, srcY, width, height, deltaX, deltaY) {
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
    PNG2.prototype.bitblt = function(dst, srcX, srcY, width, height, deltaX, deltaY) {
      PNG2.bitblt(this, dst, srcX, srcY, width, height, deltaX, deltaY);
      return this;
    };
    PNG2.adjustGamma = function(src) {
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
    PNG2.prototype.adjustGamma = function() {
      PNG2.adjustGamma(this);
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

// src/capture/index.ts
import { mkdir as mkdir2, writeFile as writeFile2 } from "fs/promises";
import { dirname as dirname2 } from "path";

// src/capture/resources.ts
var MAX_RESOURCE_BYTES = 4e6;
async function resolveResourceUris(page, urls) {
  const unique = [.../* @__PURE__ */ new Set([...urls])].filter((u) => u && !u.startsWith("data:"));
  const out = {};
  await Promise.all(
    unique.map(async (u) => {
      try {
        const resp = await page.request.get(u, { timeout: 8e3 });
        if (!resp.ok()) return;
        const buf = await resp.body();
        if (buf.length > MAX_RESOURCE_BYTES) return;
        const ct = resp.headers()["content-type"] || "application/octet-stream";
        out[u] = `data:${ct.split(";")[0]};base64,${buf.toString("base64")}`;
      } catch {
      }
    })
  );
  return out;
}
function inlineResolvedUris(html, dataUris) {
  let out = html;
  for (const [u, d] of Object.entries(dataUris)) {
    out = out.split(u).join(d);
    const escaped = u.replace(/&/g, "&amp;");
    if (escaped !== u) out = out.split(escaped).join(d);
  }
  return out;
}

// src/capture/m4-domsnapshot.ts
var PROPS = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "float",
  "clear",
  "z-index",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "outline-width",
  "outline-style",
  "outline-color",
  "outline-offset",
  "color",
  "background-color",
  "background-image",
  "background-position",
  "background-size",
  "background-repeat",
  "background-origin",
  "background-clip",
  "background-attachment",
  "-webkit-background-clip",
  "-webkit-text-fill-color",
  "opacity",
  "visibility",
  "overflow-x",
  "overflow-y",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-variant",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-transform",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-shadow",
  "text-indent",
  "white-space",
  "word-break",
  "overflow-wrap",
  "vertical-align",
  "list-style",
  "direction",
  "writing-mode",
  "unicode-bidi",
  "box-shadow",
  "filter",
  "backdrop-filter",
  "mix-blend-mode",
  "isolation",
  "transform",
  "transform-origin",
  "perspective",
  "transform-style",
  "clip-path",
  "-webkit-clip-path",
  "mask",
  "-webkit-mask",
  "-webkit-mask-image",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "order",
  "justify-content",
  "align-items",
  "align-content",
  "align-self",
  "justify-self",
  "gap",
  "row-gap",
  "column-gap",
  "grid-template-columns",
  "grid-template-rows",
  "grid-template-areas",
  "grid-column",
  "grid-row",
  "grid-auto-flow",
  "grid-auto-columns",
  "grid-auto-rows",
  "aspect-ratio",
  "object-fit",
  "object-position",
  "content",
  "border-collapse",
  "border-spacing",
  "table-layout"
];
var NOISE = /* @__PURE__ */ new Set(["auto", "normal", "none", ""]);
var SVG_TAGS = /* @__PURE__ */ new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "use",
  "symbol",
  "clippath",
  "lineargradient",
  "radialgradient",
  "stop",
  "mask",
  "pattern",
  "image",
  "marker",
  "filter",
  "fegaussianblur",
  "feoffset",
  "feblend",
  "femerge",
  "femergenode",
  "fecolormatrix",
  "fecomposite",
  "fedropshadow",
  "foreignobject",
  "title",
  "desc",
  "textpath"
]);
var VOID = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
var escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
var escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function harvestFontFaceInPage() {
  const sameOrigin = (u) => {
    try {
      return new URL(u, location.href).origin === location.origin;
    } catch {
      return false;
    }
  };
  const blocks = [];
  const tasks = [];
  const mime = (u) => /\.woff2/i.test(u) ? "woff2" : /\.woff/i.test(u) ? "woff" : /\.(ttf|truetype)/i.test(u) ? "truetype" : /\.(otf|opentype)/i.test(u) ? "opentype" : "woff2";
  async function toDataUri(abs) {
    try {
      const r = await fetch(abs, { mode: sameOrigin(abs) ? "same-origin" : "cors" });
      if (!r.ok) return null;
      const b = await r.blob();
      return await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => res(null);
        fr.readAsDataURL(b);
      });
    } catch {
      return null;
    }
  }
  function fromText(cssText, base) {
    const re = /@font-face\s*\{([^}]*)\}/gi;
    let m;
    while (m = re.exec(cssText)) {
      const body = m[1] ?? "";
      const g = (p) => {
        const r = new RegExp(p + "\\s*:\\s*([^;]+)", "i").exec(body);
        return r ? (r[1] ?? "").trim() : "";
      };
      const um = g("src").match(/url\((['"]?)([^'")]+)\1\)/);
      if (!um) continue;
      let abs;
      try {
        abs = new URL(um[2], base).href;
      } catch {
        continue;
      }
      const idx = blocks.length;
      blocks.push(null);
      tasks.push(toDataUri(abs).then((d) => {
        if (d) blocks[idx] = `@font-face{font-family:${g("font-family")};font-style:${g("font-style") || "normal"};font-weight:${g("font-weight") || "normal"};font-display:block;src:url(${d}) format('${mime(abs)}');}`;
      }));
    }
  }
  function walk(sheet) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      if (sheet.href) tasks.push(fetch(sheet.href, { mode: "cors" }).then((r) => r.ok ? r.text() : "").then((t) => t && fromText(t, sheet.href)).catch(() => {
      }));
      return;
    }
    if (!rules) return;
    for (const rule of Array.from(rules)) {
      if (rule.type === CSSRule.IMPORT_RULE) {
        const ir = rule;
        let ok = false;
        try {
          ok = !!(ir.styleSheet && ir.styleSheet.cssRules);
        } catch {
        }
        if (ok && ir.styleSheet) walk(ir.styleSheet);
        else {
          let h = ir.href;
          try {
            h = new URL(ir.href, sheet.href || location.href).href;
          } catch {
          }
          if (h) tasks.push(fetch(h, { mode: "cors" }).then((r) => r.ok ? r.text() : "").then((t) => t && fromText(t, h)).catch(() => {
          }));
        }
      } else if (rule.type === CSSRule.FONT_FACE_RULE) {
        const fr = rule;
        const src = fr.style.getPropertyValue("src");
        if (!src) continue;
        const um = src.match(/url\((['"]?)([^'")]+)\1\)/);
        if (!um) continue;
        if (um[2].startsWith("data:")) {
          blocks.push(`@font-face{${fr.style.cssText}}`);
          continue;
        }
        let abs;
        try {
          abs = new URL(um[2], sheet.href || location.href).href;
        } catch {
          continue;
        }
        const fam = fr.style.getPropertyValue("font-family");
        const wt = fr.style.getPropertyValue("font-weight") || "normal";
        const st = fr.style.getPropertyValue("font-style") || "normal";
        const idx = blocks.length;
        blocks.push(null);
        tasks.push(toDataUri(abs).then((d) => {
          if (d) blocks[idx] = `@font-face{font-family:${fam};font-style:${st};font-weight:${wt};font-display:block;src:url(${d}) format('${mime(abs)}');}`;
        }));
      }
    }
  }
  for (const s of Array.from(document.styleSheets)) walk(s);
  return Promise.all(tasks).then(() => blocks.filter(Boolean).join("\n"));
}
async function snapshotM4(page) {
  const client = await page.context().newCDPSession(page);
  let snap;
  try {
    await client.send("DOMSnapshot.enable").catch(() => {
    });
    snap = await client.send("DOMSnapshot.captureSnapshot", {
      computedStyles: PROPS,
      includePaintOrder: true,
      includeDOMRects: true
    });
  } finally {
    await client.detach().catch(() => {
    });
  }
  const strings = snap.strings;
  const doc = snap.documents[0];
  const nodes = doc.nodes;
  const nodeType = nodes["nodeType"];
  const nodeName = nodes["nodeName"];
  const nodeValue = nodes["nodeValue"];
  const parentIndex = nodes["parentIndex"];
  const attributesArr = nodes["attributes"];
  const pseudoType = nodes["pseudoType"];
  const currentSourceURL = nodes["currentSourceURL"];
  const inputValue = nodes["inputValue"];
  const inputCheckedIndex = nodes.inputChecked?.index;
  const layout = doc.layout;
  const S = (i) => i != null && i >= 0 ? strings[i] : null;
  const styleByNode = /* @__PURE__ */ new Map();
  for (let j = 0; j < layout.nodeIndex.length; j++) {
    const nodeIdx = layout.nodeIndex[j];
    const styleArr = layout.styles[j];
    if (!styleArr) continue;
    let css = "";
    const bag = {};
    for (let p = 0; p < PROPS.length; p++) {
      const v = S(styleArr[p]);
      if (v == null) continue;
      bag[PROPS[p]] = v;
      if (NOISE.has(v)) continue;
      css += `${PROPS[p]}:${v};`;
    }
    styleByNode.set(nodeIdx, { css, bag });
  }
  const children = /* @__PURE__ */ new Map();
  for (let i = 0; i < parentIndex.length; i++) {
    const p = parentIndex[i];
    if (p < 0) continue;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(i);
  }
  function attrsOf(i) {
    const flat = attributesArr[i] || [];
    const m = /* @__PURE__ */ new Map();
    for (let k = 0; k + 1 < flat.length; k += 2) {
      const name = S(flat[k]);
      const val = S(flat[k + 1]);
      if (name != null) m.set(name, val ?? "");
    }
    return m;
  }
  const resourceUrls = /* @__PURE__ */ new Set();
  const baseURL = doc.baseURL != null ? S(doc.baseURL) : doc.documentURL != null ? S(doc.documentURL) : null;
  const absUrl = (u) => {
    if (!u || u.startsWith("data:")) return null;
    try {
      return new URL(u, baseURL || void 0).href;
    } catch {
      return null;
    }
  };
  function emit(i, inSvg) {
    const type = nodeType[i];
    if (type === 3) {
      const v = S(nodeValue[i]);
      return v != null ? escText(v) : "";
    }
    if (type === 8) return "";
    if (type !== 1) return (children.get(i) || []).map((c) => emit(c, inSvg)).join("");
    const rawName = S(nodeName[i]) || "div";
    const tag = rawName.toLowerCase();
    const pseudo = pseudoType && pseudoType[i] != null ? S(pseudoType[i]) : null;
    if (tag === "script" || tag === "noscript" || tag === "link" || tag === "meta" || tag === "base" || tag === "title") {
      return "";
    }
    const styleEntry = styleByNode.get(i);
    const bag = styleEntry ? styleEntry.bag : {};
    if (pseudo === "before" || pseudo === "after") {
      const content = bag["content"];
      if (!content || content === "none" || content === "normal") return "";
      const css2 = styleEntry ? styleEntry.css : "";
      const txt = String(content).replace(/^["']|["']$/g, "");
      const safeTxt = txt && txt !== "counter" && !txt.startsWith("url(") ? escText(txt) : "";
      return `<span data-pseudo="::${pseudo}" style="${escAttr(css2)}">${safeTxt}</span>`;
    }
    if (pseudo) return "";
    const nowSvg = inSvg || tag === "svg" || SVG_TAGS.has(tag);
    if (tag === "style") {
      const inner = (children.get(i) || []).map((c) => emit(c, false)).join("");
      return `<style>${inner}</style>`;
    }
    const attrs = attrsOf(i);
    let attrStr = "";
    for (const a of [
      "class",
      "id",
      "dir",
      "lang",
      "role",
      "viewBox",
      "width",
      "height",
      "d",
      "points",
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "fill",
      "stroke",
      "stroke-width",
      "transform",
      "offset",
      "stop-color",
      "gradientUnits",
      "href",
      "xlink:href",
      "preserveAspectRatio",
      "clip-path",
      "aria-hidden"
    ]) {
      if (attrs.has(a)) attrStr += ` ${a}="${escAttr(attrs.get(a))}"`;
    }
    const css = styleEntry ? styleEntry.css : "";
    const bg = bag["background-image"];
    if (bg && bg.includes("url(")) {
      const m = bg.match(/url\((['"]?)(.*?)\1\)/);
      const abs = m && absUrl(m[2] ?? null);
      if (abs) resourceUrls.add(abs);
    }
    if (tag === "img") {
      const src = currentSourceURL && S(currentSourceURL[i]) || attrs.get("src") || "";
      const abs = absUrl(src);
      if (abs) {
        resourceUrls.add(abs);
        attrStr += ` src="${escAttr(abs)}"`;
      } else if (src) attrStr += ` src="${escAttr(src)}"`;
      if (attrs.has("alt")) attrStr += ` alt="${escAttr(attrs.get("alt"))}"`;
      return `<img${attrStr} style="${escAttr(css)}">`;
    }
    if (tag === "input" || tag === "textarea" || tag === "select") {
      const iv = inputValue && S(inputValue[i]);
      if (iv != null) attrStr += ` value="${escAttr(iv)}"`;
      if (inputCheckedIndex && inputCheckedIndex.includes(i)) attrStr += " checked";
      if (attrs.has("type")) attrStr += ` type="${escAttr(attrs.get("type"))}"`;
      if (attrs.has("placeholder")) attrStr += ` placeholder="${escAttr(attrs.get("placeholder"))}"`;
    }
    const styleAttr = css ? ` style="${escAttr(css)}"` : "";
    const open = `<${tag}${attrStr}${styleAttr}>`;
    if (VOID.has(tag)) return open;
    const kids = (children.get(i) || []).map((c) => emit(c, nowSvg)).join("");
    return `${open}${kids}</${tag}>`;
  }
  let htmlIdx = -1, bodyIdx = -1, headIdx = -1;
  for (let i = 0; i < nodeName.length; i++) {
    const nm = (S(nodeName[i]) || "").toLowerCase();
    if (nm === "html" && htmlIdx < 0) htmlIdx = i;
    if (nm === "body" && bodyIdx < 0) bodyIdx = i;
    if (nm === "head" && headIdx < 0) headIdx = i;
  }
  const htmlStyle = htmlIdx >= 0 && styleByNode.get(htmlIdx) ? styleByNode.get(htmlIdx).css : "";
  const bgColor = (htmlIdx >= 0 ? styleByNode.get(htmlIdx)?.bag["background-color"] : void 0) || (bodyIdx >= 0 ? styleByNode.get(bodyIdx)?.bag["background-color"] : void 0) || "#ffffff";
  let headStyles = "";
  if (headIdx >= 0) {
    for (const c of children.get(headIdx) || []) {
      if ((S(nodeName[c]) || "").toLowerCase() === "style") headStyles += emit(c, false);
    }
  }
  const bodyHtml = bodyIdx >= 0 ? emit(bodyIdx, false) : "";
  const fontFaceCss = await page.evaluate(harvestFontFaceInPage).catch(() => "");
  const dataUris = await resolveResourceUris(page, resourceUrls);
  let html = bodyHtml;
  for (const [u, d] of Object.entries(dataUris)) {
    html = html.split(`src="${escAttr(u)}"`).join(`src="${d}"`);
    html = html.split(u).join(d);
  }
  const out = `<!doctype html><html style="${escAttr(htmlStyle)}"><head><meta charset="utf-8"><meta name="viewport" content="width=${doc.contentWidth || ""}"><style>html,body{margin:0;background:${bgColor};}*{box-sizing:border-box;}[data-pseudo]{display:inline-block;}</style>` + (headStyles ? `<style>${headStyles}</style>` : "") + (fontFaceCss ? `<style>${fontFaceCss}</style>` : "") + `</head>${html}</html>`;
  return {
    method: "m4",
    html: out,
    scrolls: [{ sel: ":root", x: doc.scrollOffsetX || 0, y: doc.scrollOffsetY || 0 }],
    surfaces: [],
    notes: `CDP DOMSnapshot: ${layout.nodeIndex.length} laid-out nodes, ${Object.keys(dataUris).length} resources inlined; canvas/webgl/video are blind (structural method)`
  };
}

// src/capture/serialize.ts
function serializeHybridInPage() {
  const PROPS2 = [
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "float",
    "clear",
    "z-index",
    "box-sizing",
    "width",
    "height",
    "min-width",
    "min-height",
    "max-width",
    "max-height",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-top-style",
    "border-right-style",
    "border-bottom-style",
    "border-left-style",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "outline-width",
    "outline-style",
    "outline-color",
    "outline-offset",
    "color",
    "background-color",
    "background-image",
    "background-position",
    "background-size",
    "background-repeat",
    "background-origin",
    "background-clip",
    "background-attachment",
    "-webkit-background-clip",
    "-webkit-text-fill-color",
    "opacity",
    "visibility",
    "overflow",
    "overflow-x",
    "overflow-y",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-stretch",
    "font-variant",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "text-align",
    "text-transform",
    "text-decoration",
    "text-decoration-color",
    "text-decoration-line",
    "text-decoration-style",
    "text-shadow",
    "text-indent",
    "white-space",
    "word-break",
    "overflow-wrap",
    "vertical-align",
    "list-style",
    "direction",
    "writing-mode",
    "unicode-bidi",
    "box-shadow",
    "filter",
    "backdrop-filter",
    "mix-blend-mode",
    "isolation",
    "transform",
    "transform-origin",
    "perspective",
    "transform-style",
    "clip-path",
    "-webkit-clip-path",
    "mask",
    "-webkit-mask",
    "-webkit-mask-image",
    "mask-image",
    "mask-position",
    "mask-size",
    "mask-repeat",
    "mask-mode",
    "mask-composite",
    "mask-clip",
    "mask-origin",
    "flex-direction",
    "flex-wrap",
    "flex-grow",
    "flex-shrink",
    "flex-basis",
    "order",
    "justify-content",
    "align-items",
    "align-content",
    "align-self",
    "gap",
    "row-gap",
    "column-gap",
    "grid-template-columns",
    "grid-template-rows",
    "grid-template-areas",
    "grid-column",
    "grid-row",
    "grid-auto-flow",
    "grid-auto-columns",
    "grid-auto-rows",
    "aspect-ratio",
    "object-fit",
    "object-position",
    "content",
    "border-collapse",
    "border-spacing",
    "table-layout"
  ];
  const SVGNS = "http://www.w3.org/2000/svg";
  const XLINKNS = "http://www.w3.org/1999/xlink";
  const sameOrigin = (url) => {
    try {
      return new URL(url, location.href).origin === location.origin;
    } catch {
      return false;
    }
  };
  const fetchTasks = [];
  const imgRefs = [];
  const bgUrls = [];
  let imgSeq = 0;
  const toAbs = (url) => {
    try {
      return new URL(url, location.href).href;
    } catch {
      return null;
    }
  };
  const styleCss = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo ?? null);
    let out = "";
    for (const p of PROPS2) {
      const v = cs.getPropertyValue(p);
      if (v && !(v === "none" && p !== "content") && v !== "auto" && v !== "normal") out += `${p}:${v};`;
    }
    return { out, cs };
  };
  const externalSymbols = /* @__PURE__ */ new Map();
  function inlineExternalUse(useEl) {
    const href = useEl.getAttribute("href") || useEl.getAttributeNS(XLINKNS, "href") || useEl.getAttribute("xlink:href") || "";
    if (!href || href.startsWith("#") || href.startsWith("data:")) return;
    const hashIdx = href.indexOf("#");
    if (hashIdx < 0) return;
    const fileUrl = href.slice(0, hashIdx);
    const symId = href.slice(hashIdx + 1);
    fetchTasks.push(
      (async () => {
        try {
          let abs;
          try {
            abs = new URL(fileUrl, location.href).href;
          } catch {
            return;
          }
          const resp = await fetch(abs, { mode: sameOrigin(abs) ? "same-origin" : "cors" });
          if (!resp.ok) return;
          const text = await resp.text();
          const doc = new DOMParser().parseFromString(text, "image/svg+xml");
          const sym = doc.getElementById(symId);
          if (sym) {
            externalSymbols.set(symId, sym.outerHTML);
            useEl.setAttribute("href", `#${symId}`);
          }
        } catch {
        }
      })()
    );
  }
  const fontFaceTasks = [];
  const fontFaceBlocks = [];
  const mimeForFont = (url) => {
    if (/\.woff2(\?|$)/i.test(url)) return "woff2";
    if (/\.woff(\?|$)/i.test(url)) return "woff";
    if (/\.(ttf|truetype)(\?|$)/i.test(url)) return "truetype";
    if (/\.(otf|opentype)(\?|$)/i.test(url)) return "opentype";
    return "woff2";
  };
  function emitFontFace(block) {
    return `@font-face{font-family:${block.family};font-style:${block.style || "normal"};font-weight:${block.weight || "normal"};${block.stretch ? `font-stretch:${block.stretch};` : ""}${block.unicodeRange ? `unicode-range:${block.unicodeRange};` : ""}font-display:${block.display || "block"};src:url(${block.dataUri}) format('${block.fmt}');}`;
  }
  function collectFontFaceFromCssText(cssText, baseHref) {
    const ffRe = /@font-face\s*\{([^}]*)\}/gi;
    let m;
    while (m = ffRe.exec(cssText)) {
      const body2 = m[1] ?? "";
      const get = (prop) => {
        const r = new RegExp(prop + "\\s*:\\s*([^;]+)", "i").exec(body2);
        return r ? (r[1] ?? "").trim() : "";
      };
      const src = get("src");
      const urlMatch = src.match(/url\((['"]?)([^'")]+)\1\)/);
      if (!urlMatch) continue;
      const url = urlMatch[2];
      const family = get("font-family");
      const idx = fontFaceBlocks.length;
      fontFaceBlocks.push(null);
      fontFaceTasks.push(
        (async () => {
          let abs;
          try {
            abs = new URL(url, baseHref || location.href).href;
          } catch {
            return;
          }
          try {
            const resp = await fetch(abs, { mode: sameOrigin(abs) ? "same-origin" : "cors" });
            if (!resp.ok) return;
            const blob = await resp.blob();
            const dataUri = await new Promise((res) => {
              const fr = new FileReader();
              fr.onload = () => res(fr.result);
              fr.onerror = () => res(null);
              fr.readAsDataURL(blob);
            });
            if (!dataUri) return;
            fontFaceBlocks[idx] = emitFontFace({
              family,
              style: get("font-style"),
              weight: get("font-weight"),
              stretch: get("font-stretch"),
              unicodeRange: get("unicode-range"),
              display: get("font-display"),
              dataUri,
              fmt: mimeForFont(abs)
            });
          } catch {
          }
        })()
      );
    }
  }
  function collectFontFaceRules(sheet) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      if (sheet.href) {
        fontFaceTasks.push(
          fetch(sheet.href, { mode: "cors" }).then((r) => r.ok ? r.text() : "").then((t) => {
            if (t) collectFontFaceFromCssText(t, sheet.href);
          }).catch(() => {
          })
        );
      }
      return;
    }
    if (!rules) return;
    for (const rule of Array.from(rules)) {
      if (rule.type === CSSRule.IMPORT_RULE) {
        const importRule = rule;
        let importedReadable = false;
        try {
          importedReadable = !!(importRule.styleSheet && importRule.styleSheet.cssRules);
        } catch {
          importedReadable = false;
        }
        if (importedReadable && importRule.styleSheet) {
          collectFontFaceRules(importRule.styleSheet);
        } else {
          let importHref = importRule.href;
          try {
            importHref = new URL(importRule.href, sheet.href || location.href).href;
          } catch {
          }
          if (importHref) {
            fontFaceTasks.push(
              fetch(importHref, { mode: "cors" }).then((r) => r.ok ? r.text() : "").then((t) => {
                if (t) collectFontFaceFromCssText(t, importHref);
              }).catch(() => {
              })
            );
          }
        }
      } else if (rule.type === CSSRule.FONT_FACE_RULE) {
        const ffRule = rule;
        const src = ffRule.style.getPropertyValue("src");
        if (!src) continue;
        const urlMatch = src.match(/url\((['"]?)([^'")]+)\1\)/);
        if (!urlMatch) continue;
        const url = urlMatch[2];
        const family = ffRule.style.getPropertyValue("font-family");
        const weight = ffRule.style.getPropertyValue("font-weight") || "normal";
        const style = ffRule.style.getPropertyValue("font-style") || "normal";
        const stretch = ffRule.style.getPropertyValue("font-stretch") || "";
        const unicodeRange = ffRule.style.getPropertyValue("unicode-range") || "";
        const display = ffRule.style.getPropertyValue("font-display") || "block";
        if (url.startsWith("data:")) {
          fontFaceBlocks.push(`@font-face{${ffRule.style.cssText}}`);
          continue;
        }
        const idx = fontFaceBlocks.length;
        fontFaceBlocks.push(null);
        fontFaceTasks.push(
          (async () => {
            let abs;
            try {
              abs = new URL(url, sheet.href || location.href).href;
            } catch {
              return;
            }
            try {
              const resp = await fetch(abs, { mode: sameOrigin(abs) ? "same-origin" : "cors" });
              if (!resp.ok) return;
              const blob = await resp.blob();
              const dataUri = await new Promise((res) => {
                const fr = new FileReader();
                fr.onload = () => res(fr.result);
                fr.onerror = () => res(null);
                fr.readAsDataURL(blob);
              });
              if (!dataUri) return;
              fontFaceBlocks[idx] = emitFontFace({
                family,
                style,
                weight,
                stretch,
                unicodeRange,
                display,
                dataUri,
                fmt: mimeForFont(abs)
              });
            } catch {
            }
          })()
        );
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) collectFontFaceRules(sheet);
  const surfaces = [];
  let surfaceSeq = 0;
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, vx: r.left, vy: r.top, w: r.width, h: r.height };
  }
  function withContainingBlock(style, pos) {
    const p = (pos || "").trim();
    if (p && p !== "static") return style;
    return `${style};position:relative`;
  }
  function tryCanvasDataUri(canvas) {
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }
  function tryVideoDataUri(video) {
    try {
      const c = document.createElement("canvas");
      c.width = video.videoWidth || video.clientWidth;
      c.height = video.videoHeight || video.clientHeight;
      if (!c.width || !c.height) return null;
      c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    } catch {
      return null;
    }
  }
  function isUnserializable(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "canvas") return "canvas";
    if (tag === "video") return "video";
    if (tag === "iframe") {
      const src = el.getAttribute("src") || "";
      if (src && !sameOrigin(src)) return "iframe";
    }
    return null;
  }
  function clone(el) {
    const kind = isUnserializable(el);
    if (kind) {
      const id = `hyb${surfaceSeq++}`;
      const rect = rectOf(el);
      let dataUri = null;
      if (kind === "canvas") dataUri = tryCanvasDataUri(el);
      else if (kind === "video") dataUri = tryVideoDataUri(el);
      const { out: out2, cs: pcs } = styleCss(el);
      const surface = {
        id,
        kind,
        rect,
        dataUri,
        needPlaywrightShot: !dataUri,
        clip: {
          borderRadius: pcs.getPropertyValue("border-top-left-radius") + " " + pcs.getPropertyValue("border-top-right-radius") + " " + pcs.getPropertyValue("border-bottom-right-radius") + " " + pcs.getPropertyValue("border-bottom-left-radius"),
          clipPath: pcs.getPropertyValue("clip-path")
        }
      };
      surfaces.push(surface);
      const ph = document.createElement("div");
      ph.setAttribute("data-hybrid-id", id);
      ph.setAttribute("style", withContainingBlock(out2, pcs.getPropertyValue("position")));
      return ph;
    }
    const tag = el.tagName.toLowerCase();
    if (el.namespaceURI === SVGNS || tag === "svg") {
      el.querySelectorAll("use").forEach((u) => inlineExternalUse(u));
      const frag = new DOMParser().parseFromString(
        `<svg xmlns="${SVGNS}" xmlns:xlink="${XLINKNS}">${el.outerHTML}</svg>`,
        "image/svg+xml"
      );
      const parsed = frag.documentElement.firstElementChild;
      const { out: cssText } = styleCss(el);
      if (parsed && cssText) parsed.setAttribute("style", (parsed.getAttribute("style") || "") + cssText);
      return parsed || document.createElementNS(SVGNS, "g");
    }
    const out = document.createElement(tag === "html" ? "div" : tag);
    const { out: css, cs } = styleCss(el);
    if (css) out.setAttribute("style", css);
    const bg = cs.getPropertyValue("background-image");
    if (bg && bg.includes("url(")) {
      const urlRe = /url\((['"]?)([^'")]+)\1\)/g;
      let bm;
      while (bm = urlRe.exec(bg)) {
        const u = bm[2];
        if (u && !u.startsWith("data:")) {
          const abs = toAbs(u);
          if (abs) bgUrls.push(abs);
        }
      }
    }
    for (const a of ["class", "id", "width", "height", "viewBox", "role", "dir", "lang"]) {
      if (el.hasAttribute(a)) out.setAttribute(a, el.getAttribute(a));
    }
    if (tag === "img") {
      const img = el;
      const src = img.currentSrc || img.src;
      if (img.alt) out.setAttribute("alt", img.alt);
      if (src) {
        if (src.startsWith("data:")) {
          out.setAttribute("src", src);
        } else {
          const abs = toAbs(src) || src;
          out.setAttribute("src", abs);
          const id = `img${imgSeq++}`;
          out.setAttribute("data-hybrid-img", id);
          imgRefs.push({ id, url: abs, rect: rectOf(el) });
        }
      }
      return out;
    }
    if (tag === "input" || tag === "textarea" || tag === "select") {
      const field = el;
      if (field.type) out.setAttribute("type", field.type);
      if (field.value != null) out.setAttribute("value", field.value);
      if (field.checked) out.setAttribute("checked", "");
      if (field.placeholder) out.setAttribute("placeholder", field.placeholder);
    }
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.getPropertyValue("content");
      if (content && content !== "none" && content !== "normal") {
        const { out: pcss } = styleCss(el, pseudo);
        const span = document.createElement("span");
        span.setAttribute("data-pseudo", pseudo);
        span.setAttribute("style", pcss);
        const txt = content.replace(/^["']|["']$/g, "");
        if (txt && txt !== "counter") span.textContent = txt;
        if (pseudo === "::before") out.insertBefore(span, out.firstChild);
        else out.appendChild(span);
      }
    }
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) out.appendChild(document.createTextNode(node.nodeValue ?? ""));
      else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node;
        const tn = child.tagName.toLowerCase();
        if (tn === "script" || tn === "noscript" || tn === "style" || tn === "link") continue;
        out.appendChild(clone(child));
      }
    }
    return out;
  }
  const scrolls = [
    { sel: ":root", x: window.scrollX, y: window.scrollY }
  ];
  document.querySelectorAll("*").forEach((el, i) => {
    if (el.scrollTop || el.scrollLeft) {
      el.setAttribute("data-m5-scroll", `${i}`);
      scrolls.push({ sel: `[data-m5-scroll="${i}"]`, x: el.scrollLeft, y: el.scrollTop });
    }
  });
  const body = clone(document.body);
  async function drainTasks() {
    let n = -1;
    while (fetchTasks.length + fontFaceTasks.length !== n) {
      n = fetchTasks.length + fontFaceTasks.length;
      await Promise.all([...fetchTasks, ...fontFaceTasks]);
    }
  }
  return drainTasks().then(() => {
    const rootStyle = styleCss(document.documentElement).out;
    const bgColor = getComputedStyle(document.documentElement).backgroundColor;
    const fontFaceCss = fontFaceBlocks.filter(Boolean).join("\n");
    let extDefs = "";
    if (externalSymbols.size) {
      extDefs = `<svg xmlns="${SVGNS}" width="0" height="0" style="position:absolute" aria-hidden="true">` + [...externalSymbols.values()].join("") + `</svg>`;
    }
    const payload = {
      rootStyle,
      bodyHtml: body.outerHTML,
      scrolls,
      surfaces,
      imgRefs,
      bgUrls,
      dpr: window.devicePixelRatio,
      vw: window.innerWidth,
      vh: window.innerHeight,
      lang: document.documentElement.lang || "",
      dir: document.documentElement.dir || "",
      bgColor,
      fontFaceCss,
      extDefs
    };
    return JSON.stringify(payload);
  });
}
function detectClosedShadowInPage() {
  const all = document.querySelectorAll("*");
  for (const el of Array.from(all)) {
    const tag = el.tagName.toLowerCase();
    if (!tag.includes("-")) continue;
    if (!customElements.get(tag)) continue;
    if (el.shadowRoot === null) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return true;
    }
  }
  return false;
}

// src/capture/m7-hybrid.ts
function injectIntoBody(bodyHtml, injected) {
  if (!injected) return bodyHtml;
  const m = bodyHtml.match(/^(\s*<body[^>]*>)/i);
  if (m) return bodyHtml.slice(0, m[0].length) + injected + bodyHtml.slice(m[0].length);
  return injected + bodyHtml;
}
function sidecarImg(s) {
  if (!s.dataUri) return "";
  const radius = s.clip?.borderRadius?.trim() ? `border-radius:${s.clip.borderRadius};` : "";
  const clipPath = s.clip?.clipPath && s.clip.clipPath !== "none" ? `clip-path:${s.clip.clipPath};` : "";
  const style = `position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;${radius}${clipPath}`;
  return `<img data-hybrid-sidecar="${s.id}" src="${s.dataUri}" style="${style}">`;
}
function injectSidecars(bodyHtml, surfaces) {
  let html = bodyHtml;
  for (const s of surfaces) {
    const img = sidecarImg(s);
    if (!img) continue;
    const re = new RegExp(`(<[a-zA-Z][^>]*\\bdata-hybrid-id="${s.id}"[^>]*>)`);
    if (re.test(html)) html = html.replace(re, `$1${img}`);
  }
  return html;
}
async function shotDataUri(page, rect) {
  try {
    const buf = await page.screenshot({
      clip: {
        x: Math.max(0, rect.vx),
        y: Math.max(0, rect.vy),
        width: Math.max(1, rect.w),
        height: Math.max(1, rect.h)
      }
    });
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
async function snapshotM7(page) {
  const payload = JSON.parse(await page.evaluate(serializeHybridInPage));
  const dataUris = await resolveResourceUris(page, [
    ...payload.imgRefs.map((r) => r.url),
    ...payload.bgUrls
  ]);
  for (const ref of payload.imgRefs) {
    if (dataUris[ref.url]) continue;
    if (ref.rect.w < 1 || ref.rect.h < 1) continue;
    const uri = await shotDataUri(page, ref.rect);
    if (uri) dataUris[ref.url] = uri;
  }
  for (const s of payload.surfaces) {
    if (s.dataUri) continue;
    s.dataUri = await shotDataUri(page, s.rect);
  }
  const bodyInlined = inlineResolvedUris(payload.bodyHtml, dataUris);
  const bodyWithDefs = injectIntoBody(bodyInlined, payload.extDefs || "");
  const bodyWithInjections = injectSidecars(bodyWithDefs, payload.surfaces);
  const html = `<!doctype html><html lang="${payload.lang}" dir="${payload.dir}" style="${payload.rootStyle}"><head><meta charset="utf-8"><meta name="viewport" content="width=${payload.vw}"><style>html,body{margin:0;background:${payload.bgColor || "#fff"};}*{box-sizing:border-box;}[data-hybrid-id]{position:relative;}</style>` + (payload.fontFaceCss ? `<style>${payload.fontFaceCss}</style>` : "") + `</head>${bodyWithInjections}</html>`;
  const surfaceMeta = payload.surfaces.map((s) => ({
    id: s.id,
    kind: s.kind,
    rect: s.rect,
    rasterized: Boolean(s.dataUri),
    via: s.needPlaywrightShot ? "playwright" : "inline"
  }));
  return {
    method: "m7",
    html,
    scrolls: payload.scrolls,
    surfaces: surfaceMeta,
    notes: `m5 DOM + ${Object.keys(dataUris).length} resources inlined (node-side) + ${surfaceMeta.filter((s) => s.rasterized).length}/${surfaceMeta.length} surfaces rasterized`
  };
}

// src/capture/remount.ts
import { chromium as chromium2 } from "playwright-core";

// src/render/playwright-driver.ts
import { existsSync } from "fs";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright-core";

// src/render/ffmpeg-transcode.ts
import { execFile } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFile);

// src/render/playwright-driver.ts
var CHROMIUM_NOT_FOUND_MESSAGE = `\u2717 Chromium browser not found. Required for rendering compositions.

  Option 1 (recommended): npx playwright install chromium
  Option 2: set CHROME_PATH to your system Chrome (~200 MB savings)

Run one of the above and try again.`;
var ChromiumNotFoundError = class extends Error {
  constructor() {
    super(CHROMIUM_NOT_FOUND_MESSAGE);
    this.name = "ChromiumNotFoundError";
  }
};
function resolveChromiumExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    safePlaywrightExecutablePath()
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return void 0;
}
function safePlaywrightExecutablePath() {
  try {
    return chromium.executablePath();
  } catch {
    return void 0;
  }
}

// src/capture/remount.ts
var DEFAULT_CAPTURE_SETTINGS = {
  width: 1e3,
  height: 800,
  deviceScaleFactor: 2
};
var LAUNCH_ARGS = [
  "--force-color-profile=srgb",
  "--disable-lcd-text",
  "--font-render-hinting=none",
  "--disable-skia-runtime-opts",
  "--hide-scrollbars"
];
async function launchBrowser() {
  const executablePath = resolveChromiumExecutable();
  if (!executablePath) throw new ChromiumNotFoundError();
  return chromium2.launch({ headless: true, executablePath, args: LAUNCH_ARGS });
}
var KILL_ANIM_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;animation-play-state:paused!important;scroll-behavior:auto!important}";
async function settle(page) {
  await page.addStyleTag({ content: KILL_ANIM_CSS }).catch(() => {
  });
  await page.evaluate(async () => {
    try {
      if (document.fonts?.ready) await document.fonts.ready;
    } catch {
    }
    try {
      document.querySelectorAll("video,audio").forEach((m) => {
        const el = m;
        el.pause();
        if (Number.isFinite(el.duration)) el.currentTime = 0;
      });
    } catch {
    }
    try {
      for (const a of document.getAnimations()) {
        a.currentTime = 0;
        a.pause();
      }
    } catch {
    }
  }).catch(() => {
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))).catch(() => {
  });
}
async function viewportShot(page) {
  return page.screenshot({ type: "png" });
}
async function navigate(page, url, idleMs = 6e3) {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: idleMs }).catch(() => {
  });
  await settleDynamicContent(page);
  await page.waitForTimeout(400);
  return resp;
}
async function settleDynamicContent(page, maxIters = 8, stepMs = 600) {
  let prev = -1;
  for (let i = 0; i < maxIters; i += 1) {
    const len = await page.evaluate(() => (document.body?.innerText || "").length).catch(() => prev);
    if (len === prev) return;
    prev = len;
    await page.waitForTimeout(stepMs);
  }
}
async function openPage(browser, settings, storageState) {
  const context = await browser.newContext({
    viewport: { width: settings.width, height: settings.height },
    deviceScaleFactor: settings.deviceScaleFactor,
    reducedMotion: "reduce",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    ...storageState ? { storageState } : {}
  });
  return context.newPage();
}
async function remountScreenshot(html, scrolls, settings = DEFAULT_CAPTURE_SETTINGS) {
  const browser = await launchBrowser();
  try {
    const page = await openPage(browser, settings);
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready).catch(() => {
    });
    await restoreScroll(page, scrolls);
    await settle(page);
    return await viewportShot(page);
  } finally {
    await browser.close();
  }
}
async function restoreScroll(page, scrolls) {
  await page.evaluate((list) => {
    for (const s of list) {
      if (s.sel === ":root") {
        window.scrollTo(s.x, s.y);
        continue;
      }
      const el = document.querySelector(s.sel);
      if (el) {
        el.scrollLeft = s.x;
        el.scrollTop = s.y;
      }
    }
  }, scrolls).catch(() => {
  });
}

// src/capture/index.ts
function shouldFallbackToM4(signals) {
  if (signals.closedShadow) return true;
  const csp = (signals.csp ?? "").toLowerCase();
  if (!csp) return false;
  if (/(?:default-src|connect-src)\s+'none'/.test(csp)) return true;
  if (/connect-src\s+'self'(?:[^;]*)?(?:;|$)/.test(csp) && !/connect-src[^;]*https?:/.test(csp)) return true;
  return false;
}
async function captureDom(page, opts = {}) {
  let method;
  if (opts.forceMethod) {
    method = opts.forceMethod;
  } else {
    const closedShadow = await page.evaluate(detectClosedShadowInPage).catch(() => false);
    method = shouldFallbackToM4({ closedShadow, csp: opts.csp }) ? "m4" : "m7";
  }
  return method === "m4" ? snapshotM4(page) : snapshotM7(page);
}

// src/verify/diff.ts
import { readFile, mkdir as mkdir3, writeFile as writeFile3 } from "fs/promises";
import { dirname as dirname3 } from "path";

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
function decodePng(buffer) {
  return toRgba(import_pngjs.PNG.sync.read(buffer));
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
function roundTo(value, places) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
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

// src/eligibility/classify.ts
var MIN_REPEAT = 3;
var HERO_FRACTION = 0.35;
var CANVAS_FRACTION = 0.35;
var ANCHOR_STABLE_MIN = 0.6;
function collectSignalsInPage() {
  const MIN_REPEAT2 = 3;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const viewportArea = Math.max(1, vw * vh);
  const area = (el) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, r.width) * Math.max(0, r.height);
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };
  const repeated = [];
  const cssPath = (el) => {
    if (el.id) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 1);
    return cls.length ? `${tag}.${cls[0]}` : tag;
  };
  for (const table of Array.from(document.querySelectorAll("table"))) {
    if (!visible(table)) continue;
    const rows = table.querySelectorAll("tbody tr, tr").length;
    if (rows >= 2) repeated.push({ kind: "table", count: rows, selector: cssPath(table) });
  }
  for (const list of Array.from(document.querySelectorAll("ul,ol"))) {
    if (!visible(list)) continue;
    const items = Array.from(list.children).filter((c) => c.tagName.toLowerCase() === "li" && visible(c)).length;
    if (items >= MIN_REPEAT2) repeated.push({ kind: "list", count: items, selector: cssPath(list) });
  }
  const ariaRows = Array.from(document.querySelectorAll('[role="row"]')).filter(visible).length;
  if (ariaRows >= MIN_REPEAT2) repeated.push({ kind: "aria-rows", count: ariaRows, selector: '[role="row"]' });
  let kpiCards = 0;
  const numericDominant = (el) => {
    const t = (el.textContent || "").trim();
    if (!t || t.length > 24) return false;
    const digits = (t.match(/[0-9]/g) || []).length;
    return digits >= 1 && digits / t.replace(/\s/g, "").length >= 0.4;
  };
  const seenParents = /* @__PURE__ */ new Set();
  for (const el of Array.from(document.querySelectorAll("*"))) {
    const kids = Array.from(el.children).filter(visible);
    if (kids.length < MIN_REPEAT2) continue;
    if (seenParents.has(el)) continue;
    const tag0 = kids[0].tagName.toLowerCase();
    if (tag0 === "li" || tag0 === "tr" || tag0 === "option") continue;
    const sameTag = kids.filter((k) => k.tagName.toLowerCase() === tag0).length;
    if (sameTag < kids.length * 0.8) continue;
    if (["p", "br", "span", "a", "img"].includes(tag0)) continue;
    const structuredKids = kids.filter((k) => k.children.length >= 1).length;
    if (structuredKids < kids.length * 0.8) continue;
    const widths = kids.map((k) => k.getBoundingClientRect().width);
    const wMin = Math.min(...widths);
    const wMax = Math.max(...widths);
    if (wMax <= 0 || wMin / wMax < 0.7) continue;
    seenParents.add(el);
    repeated.push({ kind: "cards", count: kids.length, selector: cssPath(el) });
    const numericKids = kids.filter((k) => {
      const big = Array.from(k.querySelectorAll("*")).some(numericDominant) || numericDominant(k);
      return big;
    }).length;
    if (numericKids >= kids.length * 0.6) kpiCards = Math.max(kpiCards, kids.length);
  }
  const maxRepeat = repeated.reduce((m, g) => Math.max(m, g.count), 0);
  const formFields = Array.from(document.querySelectorAll("input,select,textarea")).filter(visible).length;
  let rasterHeroFraction = 0;
  for (const img of Array.from(document.querySelectorAll("img"))) {
    if (!visible(img)) continue;
    const r = img.getBoundingClientRect();
    if (r.top > vh * 0.8) continue;
    rasterHeroFraction = Math.max(rasterHeroFraction, area(img) / viewportArea);
  }
  for (const el of Array.from(document.querySelectorAll("*"))) {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || !bg.includes("url(")) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.top > vh * 0.8) continue;
    rasterHeroFraction = Math.max(rasterHeroFraction, area(el) / viewportArea);
  }
  let canvasFraction = 0;
  for (const c of Array.from(document.querySelectorAll("canvas"))) {
    if (!visible(c)) continue;
    canvasFraction = Math.max(canvasFraction, area(c) / viewportArea);
  }
  const SEMANTIC = /* @__PURE__ */ new Set([
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "ul",
    "ol",
    "li",
    "nav",
    "header",
    "main",
    "footer",
    "section",
    "article",
    "aside",
    "form",
    "label",
    "button",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "input",
    "select",
    "textarea"
  ]);
  const isHashedToken = (t) => /^css-[a-z0-9]{4,}$/i.test(t) || /^sc-[a-z0-9]+$/i.test(t) || /^[A-Za-z][\w]*__[A-Za-z0-9]{4,}$/.test(t) || // CSS-modules Foo__hash
  /^[a-z0-9]{7,}$/i.test(t) && /[0-9]/.test(t) && /[a-z]/i.test(t);
  const stableEl = (el) => {
    if (el.id) return true;
    if (el.hasAttribute("role")) return true;
    if (SEMANTIC.has(el.tagName.toLowerCase())) return true;
    if (el.tagName.toLowerCase() === "a" && el.hasAttribute("href")) return true;
    for (const a of Array.from(el.attributes)) if (a.name.startsWith("data-")) return true;
    return false;
  };
  let stable = 0;
  let hashedOnly = 0;
  const sampleStableAnchors = [];
  const sampleHashedAnchors = [];
  const meaningful = Array.from(document.querySelectorAll("a,button,input,select,textarea,td,th,li,[role],h1,h2,h3,p,span,div")).filter(visible).filter((el) => (el.textContent || "").trim().length > 0 || ["a", "button", "input"].includes(el.tagName.toLowerCase()));
  for (const el of meaningful.slice(0, 400)) {
    if (stableEl(el)) {
      stable += 1;
      if (sampleStableAnchors.length < 8) sampleStableAnchors.push(cssPath(el));
    } else {
      const tokens = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean);
      if (tokens.some(isHashedToken)) {
        hashedOnly += 1;
        if (sampleHashedAnchors.length < 8) sampleHashedAnchors.push(tokens.find(isHashedToken));
      } else {
        stable += 1;
      }
    }
  }
  const anchorStableRatio = stable + hashedOnly === 0 ? 1 : stable / (stable + hashedOnly);
  return {
    vw,
    vh,
    repeated,
    maxRepeat,
    formFields,
    rasterHeroFraction: round(rasterHeroFraction),
    canvasFraction: round(canvasFraction),
    kpiCards,
    textChars: (document.body?.innerText || "").trim().length,
    anchorStableRatio: round(anchorStableRatio),
    sampleStableAnchors,
    sampleHashedAnchors
  };
  function round(v) {
    return Math.round(v * 1e3) / 1e3;
  }
}
function classify(signals) {
  const reasons = [];
  const hasTableOrAria = signals.repeated.some((g) => g.kind === "table" || g.kind === "aria-rows");
  const hasHomogeneous = signals.maxRepeat >= MIN_REPEAT || hasTableOrAria;
  const hasForm = signals.formFields >= 3;
  const heroHit = signals.rasterHeroFraction > HERO_FRACTION;
  const canvasHit = signals.canvasFraction > CANVAS_FRACTION;
  const kpiHit = signals.kpiCards >= MIN_REPEAT;
  if (hasHomogeneous) reasons.push(`homogeneous repeated structure (max ${signals.maxRepeat}, kinds: ${[...new Set(signals.repeated.map((r) => r.kind))].join("/") || "none"})`);
  if (hasForm) reasons.push(`form with ${signals.formFields} fields`);
  if (heroHit) reasons.push(`raster hero covers ${(signals.rasterHeroFraction * 100).toFixed(0)}% near top (ineligible)`);
  if (canvasHit) reasons.push(`dominant canvas covers ${(signals.canvasFraction * 100).toFixed(0)}% (data-as-raster, ineligible)`);
  if (kpiHit) reasons.push(`numeric/metric grid (${signals.kpiCards} cards) \u2014 DOM-reconstructable; idealization deferred (quality check is the gate)`);
  const structural = hasHomogeneous || hasForm;
  const eligible = structural && !heroHit && !canvasHit;
  if (!structural) reasons.push("no homogeneous data structure detected (fail-safe \u2192 video)");
  const animatable = signals.anchorStableRatio >= ANCHOR_STABLE_MIN;
  reasons.push(`anchor stability ${(signals.anchorStableRatio * 100).toFixed(0)}% \u2192 motion ${animatable ? "bindable" : "NOT bindable (replay-only)"}`);
  return { eligible, animatable, reasons, signals };
}

// src/eligibility/route.ts
function decideRoute(classification, quality) {
  if (!classification.eligible) {
    const reason = classification.reasons.find((r) => /ineligible|fail-safe/.test(r)) ?? "not in the reconstruction-eligible class";
    return { route: "video", reason, eligible: false, qualityPass: quality?.pass ?? null };
  }
  if (quality && !quality.pass) {
    return {
      route: "video",
      reason: `reconstruction missed the calibrated bar (pixelDiff ${quality.pixelDiffPct}%, ssim ${quality.ssim})`,
      eligible: true,
      qualityPass: false
    };
  }
  return {
    route: "reconstruction",
    reason: classification.reasons[0] ?? "eligible",
    eligible: true,
    qualityPass: quality?.pass ?? null
  };
}

// src/quality/clean-data.ts
var DEFAULT_EMPTY_PHRASES = [
  "no data",
  "no results",
  "no items",
  "no activity",
  "nothing here",
  "nothing to show",
  "you don't have any",
  "you have no",
  "get started by",
  "create your first",
  "0 results",
  "no records",
  "empty",
  "coming soon",
  "loading\u2026",
  "loading..."
];
var DEFAULT_DENY = [
  { pattern: "lorem ipsum", kind: "placeholder" },
  { pattern: "\\bdolor sit amet\\b", kind: "placeholder" },
  { pattern: "\\basdf+\\b", kind: "placeholder" },
  { pattern: "\\bqwerty\\b", kind: "placeholder" },
  { pattern: "\\bfoo ?bar\\b", kind: "placeholder" },
  { pattern: "\\bplaceholder\\b", kind: "placeholder" },
  { pattern: "\\b(dummy|sample|test) (data|text|user|value|content)\\b", kind: "placeholder" },
  { pattern: "@(example|test)\\.(com|org)\\b", kind: "placeholder" },
  { pattern: "\\bxxx+\\b", kind: "placeholder" },
  { pattern: "\\btodo\\b", kind: "placeholder" }
];
var EMAIL_RE = /[a-z0-9._%+-]+@(?!example\.|test\.)[a-z0-9.-]+\.[a-z]{2,}/gi;
var PHONE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/g;
function extractVisibleText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}
function allowed(sample, allow) {
  const s = sample.toLowerCase();
  return allow.some((a) => s.includes(a.toLowerCase()));
}
function checkCleanData(input, config = {}) {
  const html = typeof input === "string" ? input : input.html;
  const text = extractVisibleText(html);
  const lower = text.toLowerCase();
  const allow = config.allow ?? [];
  const hits = [];
  const emptyPhrases = config.emptyStatePhrases ?? DEFAULT_EMPTY_PHRASES;
  for (const phrase of emptyPhrases) {
    const idx = lower.indexOf(phrase.toLowerCase());
    if (idx >= 0) {
      const sample = text.slice(Math.max(0, idx - 12), idx + phrase.length + 12).trim();
      if (!allowed(sample, allow)) hits.push({ kind: "empty-state", sample });
    }
  }
  for (const rule of [...DEFAULT_DENY, ...config.deny ?? []]) {
    const re = new RegExp(rule.pattern, rule.flags ?? "gi");
    const m = re.exec(text);
    if (m && !allowed(m[0], allow)) hits.push({ kind: rule.kind, sample: m[0].trim() });
  }
  if (config.pii !== false) {
    const emails = (text.match(EMAIL_RE) ?? []).filter((e) => !allowed(e, allow));
    if (emails.length > (config.maxEmails ?? 0)) {
      hits.push({ kind: "pii-email", sample: `${emails.length} email(s) e.g. ${emails[0]}` });
    }
    const phones = (text.match(PHONE_RE) ?? []).map((p) => p.trim()).filter((p) => !allowed(p, allow));
    if (phones.length > (config.maxPhones ?? 0)) {
      hits.push({ kind: "pii-phone", sample: `${phones.length} phone(s) e.g. ${phones[0]}` });
    }
  }
  const reasons = Array.from(new Set(hits.map((h) => h.kind))).map((kind) => {
    const samples = hits.filter((h) => h.kind === kind).map((h) => h.sample);
    return `${kind}: ${samples.slice(0, 3).join(" | ")}`;
  });
  return { clean: hits.length === 0, reasons, hits };
}

// src/eligibility/index.ts
async function classifyPage(page) {
  const signals = await page.evaluate(collectSignalsInPage);
  return classify(signals);
}
async function evaluatePage(page, opts = {}) {
  const settings = opts.settings ?? DEFAULT_CAPTURE_SETTINGS;
  const livePng = await page.screenshot({ type: "png" });
  const classification = await classifyPage(page);
  let snapshot = null;
  if (classification.eligible) {
    snapshot = await captureDom(page, { csp: opts.csp ?? null });
  }
  let quality = null;
  let remountPng = null;
  if (snapshot) {
    remountPng = await remountScreenshot(snapshot.html, snapshot.scrolls, settings);
    const diff = diffImages(decodePng(remountPng), decodePng(livePng));
    const v = verdict(diff);
    quality = { pass: v.pass, pixelDiffPct: diff.pixelDiffPct, ssim: diff.ssim };
  }
  const decision = decideRoute(classification, quality);
  return { classification, decision, quality, livePng, remountPng, snapshot };
}
async function evaluateUrl(url, opts = {}) {
  const settings = opts.settings ?? DEFAULT_CAPTURE_SETTINGS;
  const browser = await launchBrowser();
  try {
    const page = await openPage(browser, settings, opts.storageState);
    const resp = await navigate(page, url);
    await settle(page);
    const csp = opts.csp ?? resp?.headers()["content-security-policy"] ?? null;
    return await evaluatePage(page, { settings, csp });
  } finally {
    await browser.close();
  }
}
export {
  ANCHOR_STABLE_MIN,
  CANVAS_FRACTION,
  HERO_FRACTION,
  MIN_REPEAT,
  checkCleanData,
  classify,
  classifyPage,
  collectSignalsInPage,
  decideRoute,
  evaluatePage,
  evaluateUrl,
  extractVisibleText
};
