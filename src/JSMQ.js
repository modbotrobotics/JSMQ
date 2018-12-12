/**
 * Socket connection state
 */
const ConnectionState = Object.freeze({
  CONNECTING:             0,
  OPEN:                   1,
  CLOSING:                2,
  CLOSED:                 3,
});

// DEBUG
var debugLog = false;

/**
 * Class representing a socket endpoint
 * @param {string} address - The endpoint address (ex: "ws://127.0.0.1:15798")
 */
class Endpoint {
  constructor(address) {
    this.address = address;

    this._connectionRetries = 0;
    this._connectionState = ConnectionState.CLOSED;
    this._incomingMessage = null;
    this._webSocket = null;

    this.activated = null;
    this.deactivated = null;

    this.open();
  }

  /**
   * TODO
   */
  _onMessage() {
    // Call bound callback
    if (this.onMessage != null) {
      this.onMessage(this, this._incomingMessage);
    }
    this._incomingMessage = null;
  }

  /**
   * Process a message frame, adding the payload as an ArrayBuffer to its list of frames
   *
   * @param {ArrayBuffer} frame
   */
  _processFrame(frame) {
    const view = new Uint8Array(frame);
    const more = view[0];
    const payload = new Uint8Array(view.subarray(1));

    if (this._incomingMessage == null) {
      this._incomingMessage = new Message();
    }

    // Add buffer to the incoming message, removing the MORE byte
    this._incomingMessage.addBuffer(payload);

    // Last message frame, ZeroMQ message is complete
    if (more == 0) {
      this._onMessage();
    }
  }

  /**
   * Callback on WebSocket connection closed
   *
   * On close, perform deactivated actions, set state to ClosedState.
   * Attempts to reconnect, until the number of reconnect tries exceeds the reconnect try limit.
   *
   * @param {*} e - event (unused)
   */
  _webSocketOnClose(e) {
    if (debugLog) if (debugLog) console.log("JSMQ | Endpoint WebSocket connection closed");
    let previousState = this._connectionState;
    this._connectionState = ConnectionState.CLOSED;

    if (e.code !== 1000 && e.code !== 1005) {
      if (debugLog) console.log("JSMQ | Websocket closed - code: " + e.code + ", reason: \"" + e.reason + "\"");
    }

    if ((previousState == ConnectionState.OPEN || previousState == ConnectionState.CLOSING)
      && this.deactivated != null) {
      this.deactivated(this);
    }

    if (previousState == ConnectionState.CLOSING) {
      this._webSocket.onclose = null;
      this._webSocket.onerror = null;
      this._webSocket.onmessage = null;
      this._webSocket.onopen = null;
      this._webSocket = null;
      return;
    }

    if (this._connectionRetries < 10) {
      this.open();
    }
  }

  /**
   * Callback on WebSocket connection error
   *
   * @param {*} e - event (unused)
   */
  _webSocketOnError(e) {
    if (debugLog) console.log("JSMQ | Websocket error:", e);
  }

  /**
   * Callback executed on WebSocket.onmessage
   *
   * Attempt to parse the received message.
   * Parse raw blobs to ArrayBuffer before processing the frame data.
   *
   * @param {*} e - The message event; May contain a Blob or ArrayBuffer
   */
  _webSocketOnMessage(e) {
    // Parse Blob
    if (e.data instanceof Blob) {
      let fileReader = new FileReader();
      fileReader.onload = function () {
        this._processFrame(this.result);
      };
      fileReader.readAsArrayBuffer(e.data);

    // Parse String
    } else if (typeof(e.data) === 'string' || e.data instanceof String) {
      let strs = e.data.split(",");
      let arr = strs.map( str => {
        let result = parseInt(str);
        if (result === NaN || result > 255) {
          if (debugLog) console.log("JSMQ | Failed to parse message frame -- invalid string representation of data");
        }
        return result;
      });
      this._processFrame(arr);

    // Parse ArrayBuffer
    } else if (e.data instanceof ArrayBuffer) {
      this._processFrame(e.data);

    // Other message types are not supported and will be dropped
    } else {
      if (debugLog) console.log("JSMQ | Failed to parse message frame -- unsupported message type \"" + typeof e.data + "\"");
    }
  }

  /**
   * Callback on WebSocket connection opened
   *
   * On open, perform activated actions, set endpoint state to open.
   *
   * @param {*} e - event (unused)
   */
  _webSocketOnOpen(e) {
    if (debugLog) console.log("JSMQ | Endpoint WebSocket connection opened");
    this._connectionRetries = 0;
    
    this._connectionState = ConnectionState.OPEN;
    if (this.activated != null) {
      this.activated(this);
    }
  }

  /**
   * Close an open WebSocket connection or connection attempt
   * @param {number} code - A numeric value status code explaining why the connection is being closed
   * @param {string} reason - A string explaining why the connection is being clsoed
   */
  close(code = undefined, reason = undefined) {
    if (debugLog) console.log("JSMQ | Endpoint closing WebSocket connection");
    this._connectionState = ConnectionState.CLOSING;
    if (code === undefined) {
      code = 1000;  // WebSocket CloseEvent code 1005 "No Status Recvd"
    }

    this._webSocket.close(code, reason);
    this._websocket = null;
  }

  /**
   * TODO
   */
  isOpen() {
    return (this._connectionState === ConnectionState.OPEN);
  }

  /**
   * Open a WebSocket connection to the endpoint address
   */
  open() {
    if (debugLog) console.log("JSMQ | Endpoint attempting to open WebSocket connection to address", this.address);
    if (this._webSocket != null) {
      this._webSocket.onclose = null;
      this._webSocket.onerror = null;
      this._webSocket.onmessage = null;
      this._webSocket.onopen = null;
    }

    this._webSocket = new window.WebSocket(this.address, ["WSNetMQ"]);
    this._webSocket.binaryType = "arraybuffer";
    this._connectionState = ConnectionState.CONNECTING;

    this._webSocket.onopen = this._webSocketOnOpen.bind(this);
    this._webSocket.onclose = this._webSocketOnClose.bind(this);
    this._webSocket.onerror = this._webSocketOnError.bind(this);
    this._webSocket.onmessage = this._webSocketOnMessage.bind(this);

    this._connectionRetries++;
  }

  /**
   * Write message to wire
   *
   * Each frame is sent as a separate message over WebSocket.
   * The ZWSSock reconstructs the final message from the series of separate messages.
   * A MORE byte is prepended to each message to indicate whether there are additional
   * frames coming over the wire.
   *
   * @param {Message} message - Message to write to wire
   */
  write(message) {
    const messageSize = message.getSize();

    for (let j = 0; j < messageSize; j++) {
      const frame = message.getBuffer(j);
      let data = new Uint8Array(frame.byteLength + 1);
      let more = j == messageSize - 1 ? 0 : 1;
      data[0] = more;  // set the MORE byte
      data.set(new Uint8Array(frame), 1);
      this._webSocket.send(data);
    }
  }
}

/**
 * Load Balancer for DEALER socket.
 * Each message sent is round-robined among connected peers.
 */
class LoadBalancer {
  constructor () {
    this.current = 0;
    this.endpoints = [];
    this.isActive = false;
    this.writeActivated = null;
  }

  /**
   * Attach: add an endpoint to list of endpoints
   * @param {Endpoint} endpoint - The endpoint to attach
   */
  attach(endpoint) {
    this.endpoints.push(endpoint);

    if (!this.isActive) {
      this.isActive = true;

      if (this.writeActivated != null) {
        this.writeActivated();
      }
    }
  }

  /**
   * TODO
   * @return {Boolean}
   */
  getHasOut() {
    // Deprecated / old
    // if (this.inprogress) {
    //   return true;
    // }

    return this.endpoints.length > 0;
  }

  /**
   * Send message over the current endpoint
   * Endpoints are alternated in a round robin fashion.
   * @param {Message} message - The message to send
   * @return {Boolean} - Success
   */
  send(message) {
    if (this.endpoints.length == 0) {
      this.isActive = false;
      if (debugLog) console.log("JSMQ | Failed to send message - no valid endpoints");
      return false;
    }

    this.endpoints[this.current].write(message);
    this.current = (this.current + 1) % this.endpoints.length;

    return true;
  }

  /**
   * Terminate: remove an endpoint from list of endpoints
   * @param {Endpoint} endpoint
   */
  terminate(endpoint) {
    const index = this.endpoints.indexOf(endpoint);

    if (this.current == this.endpoints.length - 1) {
      this.current = 0;
    }

    this.endpoints.splice(index, 1);
    if (this.endpoints.length == 0) {
      this.isActive = false;
    }
  }
}

/**
 * ZWSSocket
 */
export class ZWSSocket {
  constructor() {
    this.endpoints = [];
    this.onDisconnect = null;
    this.onMessage = null;
  };

  /**
   * TODO
   */
  _onEndpointActivated(endpoint) {
    this._attachEndpoint(endpoint);
  }

  /**
   * TODO
   */
  _onEndpointDeactivated(endpoint) {
    this._terminateEndpoint(endpoint);
    if (this.onDisconnect != null) {
      this.onDisconnect(endpoint);
    }
  }

  /**
   * TODO
   */
  connect(address) {
    let endpoint = new Endpoint(address);
    endpoint.activated = this._onEndpointActivated.bind(this);
    endpoint.deactivated = this._onEndpointDeactivated.bind(this);
    endpoint.onMessage = this._onMessage.bind(this);
    this.endpoints.push(endpoint);
  };

  /**
   * TODO
   */
  disconnect(address, code = undefined, reason = undefined) {
    const endpoint = this.endpoints.find(endpoint => {
      return (endpoint.address === address);
    });

    if (endpoint !== undefined) {
      endpoint.close(code, reason);
      this.endpoints.splice(this.endpoints.indexOf(endpoint), 1);
    } else {
      throw new Error("Failed to disconnect from address \""
        + address + "\" - endpoint not connected to this address", this.endpoints);
    }
  };

  /**
   * TODO
   * @return {Boolean}
   */
  getHasOut() {
    return this._hasOut();
  };

  /**
   * TODO
   * @return {Boolean}
   */
  send(message) {
    return this._send(message);
  };
}

/**
 * Class representing a ZeroMQ DEALER type socket
 */
export class Dealer extends ZWSSocket {
  constructor() {
    super();
    this.lb = new LoadBalancer();
    this.lb.writeActivated = () => {
      if (this.sendReady != null) {
        this.sendReady();
      }
    };

    this._responseQueue = [];
    this._responseCallbackQueue = [];
  };

  /**
   * TODO
   * @param {}
   */
  _attachEndpoint(endpoint) {
    this.lb.attach(endpoint);
  }

  /**
   * TODO
   * @param {}
   */
  _terminateEndpoint(endpoint) {
    this.lb.terminate(endpoint);

    // If there are no remaining endpoints connected, drain queues
    if (!this._hasOut()) {
      this._responseQueue = [];
      this._responseCallbackQueue = [];
    }
  }

  /**
   * TODO
   * @return {Boolean}
   */
  _hasOut() {
    return this.lb.getHasOut();
  }

  /**
   * TODO
   * @param {}
   * @param {}
   */
  _onMessage(endpoint, message) {
    // Do nothing with the sender peer for now

    // If general callback exists, execute it  // TODO(aelsen): remove?
    if (this.onMessage != null) {
      this.onMessage(message);
    }
    // If response callback exists, execute it
    if (this._responseCallbackQueue.length !== 0) {
      this._responseCallbackQueue.shift().resolve(message);

      // Otherwise, queue message
    } else {
      this._responseQueue.push(message);
    }
  }

  /**
   * TODO
   * @return {Boolean}
   */
  _send(message) {
    return this.lb.send(message);
  }

  /**
   * TODO
   */
  receive() {
    if (this._responseQueue.length !== 0) {
      return Promise.resolve(this._responseQueue.shift());
    }
    if (!this.getHasOut) {
      return Promise.reject(new Error("Failed to receive message - client not connected"));
    }
    return new Promise((resolve, reject) => {
      this._responseCallbackQueue.push({ resolve, reject });
    });
  }
}

/**
 * Class representing a ZeroMQ SUBSCRIBER type socket
 */
export class Subscriber extends ZWSSocket {
  constructor() {
    super();
    this.endpoints = [];
    this.isActive = false;
    this.subscriptions = [];
  }

  /**
   * TODO
   * @param {*} subscription
   */
  subscribe(subscription) {
    if (subscription instanceof Uint8Array) {
      // continue
    }
    else if (subscription instanceof ArrayBuffer) {
      subscription = new Uint8Array(subscription);
    } else {
      subscription = StringUtility.StringToUint8Array(String(subscription));
    }

    // TODO: check if the subscription already exists
    this.subscriptions.push(subscription);

    const message = this._createSubscriptionMessageReceived(subscription, true);

    for (var i = 0; i < this.endpoints.length; i++) {
      this.endpoints[i].write(message);
    }
  };

  /**
   * TODO
   * @param {*} subscription
   */
  unsubscribe(subscription) {
    if (subscription instanceof Uint8Array) {
      // continue
    }
    else if (subscription instanceof ArrayBuffer) {
      subscription = new Uint8Array(subscription);

    } else {
      subscription = StringUtility.StringToUint8Array(String(subscription));
    }

    for (var j = 0; j < this.subscriptions.length; j++) {

      if (this.subscriptions[j].length == subscription.length) {
        var equal = true;

        for (var k = 0; k < this.subscriptions[j].length; k++) {
          if (this.subscriptions[j][k] != subscription[k]) {
            equal = false;
            break;
          }
        }

        if (equal) {
          this.subscriptions.splice(j, 1);
          break;
        }
      }
    }

    var message = this._createSubscriptionMessageReceived(subscription, false);

    for (var i = 0; i < this.endpoints.length; i++) {
      this.endpoints[i].write(message);
    }
  };


  /**
   * TODO
   * @param {*} subscription
   * @param {*} subscribe
   */
  _createSubscriptionMessageReceived(subscription, subscribe) {
    var frame = new Uint8Array(subscription.length + 1);
    frame[0] = subscribe ? 1 : 0;
    frame.set(subscription, 1);

    var message = new Message();
    message.addBuffer(frame);

    return message;
  }

  /**
   * TODO
   */
  _attachEndpoint(endpoint) {
    this.endpoints.push(endpoint);

    for (var i = 0; i < subscriptions.length; i++) {
      var message = this._createSubscriptionMessageReceived(subscriptions[i], true);

      endpoint.write(message);
    }

    if (!this.isActive) {
      this.isActive = true;

      if (this.sendReady != null) {
        this.sendReady();
      }
    }
  }

  /**
   * TODO
   */
  _terminateEndpoint(endpoint) {
    var index = this.endpoints.indexOf(endpoint);
    this.endpoints.splice(index, 1);
  }

  /**
   * TODO
   */
  _hasOut() {
    return false;
  }

  /**
   * TODO
   */
  _send(message, more) {
    throw new Error("Failed to send message - send not supported on SUB type socket");
  }

  /**
   * TODO
   */
  _onMessage(endpoint, message) {
    if (this.onMessage != null) {
      this.onMessage(message);
    }
  }
}

/**
 * Class representing a ZeroMQ message
 */
export class Message {
  constructor() {
    this.frames = [];  // Array of ArrayBuffers. Each ArrayBuffer represents a frame.
  }

  /**
   * Get size in number of frames
   * @return {number} - number of frames
   */
  getSize() {
    return this.frames.length;
  }

  /**
   * Append a boolean to the end of the message
   * @param {Boolean} bool - Buffer of data to append
   * @return {Message} - Updated message
   */
  addBoolean(bool) {
    return this.addBuffer(NumberUtility.booleanToBytes(bool));
  }

  /**
   * Append a buffer to the end of the message
   * @param {ArrayBuffer} buffer - Buffer of data to append
   * @return {Message} - Updated message
   */
  addBuffer(data) {
    if (data instanceof ArrayBuffer) {
      this.frames.push(data);

    } else if (data instanceof Uint8Array) {
      this.frames.push(data.buffer);

    } else {
      throw new Error("Failed to add buffer to message - unknown buffer type \"" + typeof buffer + "\"");
    }
    return this;
  }

  /**
   * Append a float to the end of the message
   * @param {number} number - Float to append
   * @param {number} size - Size in bytes of float (default: 8)
   * @return {Message} - Updated message
   */
  addFloat(number, size = 8) {
    return this.addBuffer(NumberUtility.floatToBytes(number, size));
  }

  /**
   * Append a signed integer to the end of the message
   * @param {number} number - Int to append
   * @param {number} size - Size in bytes of integer (default: 4)
   * @return {Message} - Updated message
   */
  addInt(number, size = 4) {
    return this.addBuffer(NumberUtility.intToBytes(number, size));
  }

    /**
   * Append a string to the end of the message
   * @param {string} str - String to append
   * @return {Message} - Updated message
   */
  addString(str) {
    str = String(str);

    let arr = new Uint8Array(str.length);

    StringUtility.StringToUint8Array(str, arr);
    return this.addBuffer(arr);
  }

  /**
   * Append an unsigned integer to the end of the message
   * @param {number} number - Int to append
   * @param {number} size - Size in bytes of integer (default: 4)
   * @return {Message} - Updated message
   */
  addUint(number, size = 4) {
    return this.addBuffer(NumberUtility.uintToBytes(number, size));
  }


  /**
   * Get a boolean at the specified frame location
   * @param {Boolean} i - Index of frame to fetch
   */
  getBoolean(i) {
    return NumberUtility.bytesToBoolean(this.getBuffer(i));
  }

  /**
   * Get the frame at the specified location
   * @param {number} i - Frame location
   * @return {ArrayBuffer} - Frame payload
   */
  getBuffer(i) {
    return this.frames[i];
  }

  /**
   * Get a float at the specified frame location
   * @param {number} i - Index of frame to fetch
   * @param {number} size - Size in bytes of float (default: 8)
   */
  getFloat(i, size = 8) {
    return NumberUtility.bytesToFloat(this.getBuffer(i), size);
  }

  /**
   * Get a signed integer at the specified frame location
   * @param {number} i - Index of frame to fetch
   * @param {number} size - Size in bytes of integer (default: 4)
   */
  getInt(i, size = 4) {
    return NumberUtility.bytesToInt(this.getBuffer(i), size);
  }

  /**
   * Get a string at the specified frame location
   * @param {number} i - Index of frame to fetch
   */
  getString(i) {
    return StringUtility.Uint8ArrayToString(new Uint8Array(this.getBuffer(i)));
  }

  /**
   * Get a unsigned integer at the specified frame location
   * @param {number} i - Index of frame to fetch
   * @param {number} size - Size in bytes of integer (default: 4)
   */
  getUint(i, size = 4) {
    return NumberUtility.bytesToUint(this.getBuffer(i), size);
  }

  /**
   * Insert a boolean at frame index i of the message
   * @param {number} i - Insert index
   * @param {Boolean} bool - Number to insert
   * @return {Message} - Updated message
   */
  insertBoolean(i, bool) {
    return this.insertBuffer(i, NumberUtility.booleanToBytes(bool));
  }

  /**
   * Insert a buffer at frame index i of the message
   * @param {number} i - Insert index
   * @param {*} buffer - Buffer to insert
   * @return {Message} - Updated message
   */
  insertBuffer(i, data) {
    if (i === undefined) {
      i = 0;
    }

    if (data instanceof ArrayBuffer) {
      this.frames.splice(i, 0, data);

    } else if (data instanceof Uint8Array) {
      this.frames.splice(i, 0, data.buffer);

    } else {
      throw new Error("Failed to insert buffer into message - unknown buffer type \"" + typeof buffer + "\"");
    }
    return this;
  }

  /**
   * Insert a float at frame index i of the message
   * @param {number} i - Insert index
   * @param {number} number - Number to insert
   * @return {Message} - Updated message
   */
  insertFloat(i, number, size = 8) {
    return this.insertBuffer(i, NumberUtility.floatToBytes(number, size));
  }

  /**
   * Insert a signed integer at frame index i of the message
   * @param {number} i - Insert index
   * @param {number} number - Number to insert
   * @param {number} size - Size in bytes of integer (default: 4)
   * @return {Message} - Updated message
   */
  insertInt(i, number, size = 4) {
    return this.insertBuffer(i, NumberUtility.intToBytes(number, size));
  }

  /**
   * Insert a string at frame index i of the message
   * @param {number} i - Insert index
   * @param {string} str - String to insert
   * @return {Message} - Updated message
   */
  insertString(i, str) {
    str = String(str);
    var arr = new Uint8Array(str.length);
    StringUtility.StringToUint8Array(str, arr);

    return this.insertBuffer(i, arr.buffer);
  }

  /**
   * Insert an unsigned integer at frame index i of the message
   * @param {number} i - Insert index
   * @param {number} number - Number to insert
   * @param {number} size - Size in bytes of integer (default: 4)
   * @return {Message} - Updated message
   */
  insertUint(i, number, size = 4) {
    return this.insertBuffer(i, NumberUtility.uintToBytes(number, size));
  }

  /**
   * Pop the first frame of the message, as a boolean
   * @return {Boolean}
   */
  popBoolean() {
    const frame = this.popBuffer();
    return NumberUtility.bytesToBoolean(frame);
  }

  /**
   * Pop the first frame of the message, as an ArrayBuffer
   * @return {ArrayBuffer} - Frame payload
   */
  popBuffer() {
    var frame = this.frames[0];
    this.frames.splice(0, 1);

    return frame;
  }

  /**
   * Pop the first frame of the message, as a float
   * @param {number} size - Size in bytes of float (default: 8)
   * @return {float}
   */
  popFloat(size = 8) {
    const frame = this.popBuffer();

    // If we've only consumed part of the frame, save the rest
    if (frame.byteLength > size) {
      let left = frame.slice(size);

      this.insertBuffer(0, left);
    }

    // If we've consumed part of the frame, save the rest
    return NumberUtility.bytesToFloat(frame, size);
  }

  /**
   * Pop the first frame of the message, as an integer
   * @param {number} size - Size in bytes of integer (default: 4)
   * @return {number}
   */
  popInt(size = 4) {
    const frame = this.popBuffer();
    // If we've only consumed part of the frame, save the rest
    if (frame.byteLength > size) {
      let left = frame.slice(size);

      this.insertBuffer(0, left);
    }
    return NumberUtility.bytesToInt(frame, size);
  }

  /**
   * Pop the first frame of the message, as a string
   * @return {string}
   */
  popString() {
    const frame = this.popBuffer();
    return StringUtility.Uint8ArrayToString(new Uint8Array(frame));
  }

  /**
   * Pop the first frame of the message, as an unsigned integer
   * @param {number} size - Size in bytes of integer (default: 4)
   * @return {number}
   */
  popUint(size = 4) {
    const frame = this.popBuffer();
    // If we've only consumed part of the frame, save the rest
    if (frame.byteLength > size) {
      let left = frame.slice(size);

      this.insertBuffer(0, left);
    }
    return NumberUtility.bytesToUint(frame, size);
  }
}

// Number Utility
export function NumberUtility() {}

NumberUtility.littleEndian = true;

NumberUtility.bytesToBoolean = function (buf, offset = 0) {
  let view = new DataView(buf);

  return (view.getInt8(offset, NumberUtility.littleEndian) > 0 ? true : false);
}

NumberUtility.bytesToFloat = function (buf, size, offset = 0) {
  let view = new DataView(buf);

  if (size == 4) {
    return view.getFloat32(offset, NumberUtility.littleEndian);
  } else if (size == 8) {
    return view.getFloat64(offset, NumberUtility.littleEndian);
  } else {
    throw new Error("Failed to convert bytes to int - invalid integer size (size of " + size + ")");
  }
}

NumberUtility.bytesToInt = function (buf, size, offset = 0) {
  let view = new DataView(buf);

  if (size == 1) {
    return view.getInt8(offset, NumberUtility.littleEndian);
  } else if (size == 2) {
    return view.getInt16(offset, NumberUtility.littleEndian);
  } else if (size == 4) {
    return view.getInt32(offset, NumberUtility.littleEndian);
  } else {
    throw new Error("Failed to convert bytes to int - invalid integer size (size of " + size + ")");
  }
}

NumberUtility.bytesToUint = function (buf, size, offset = 0) {
  let view = new DataView(buf);

  if (size == 1) {
    return view.getUint8(offset, NumberUtility.littleEndian);
  } else if (size == 2) {
    return view.getUint16(offset, NumberUtility.littleEndian);
  } else if (size == 4) {
    return view.getUint32(offset, NumberUtility.littleEndian);
  } else {
    throw new Error("Failed to convert bytes to int - invalid integer size (size of " + size + ")");
  }
}

NumberUtility.booleanToBytes = function (bool) {
  let buf = new ArrayBuffer(1);
  let view = new DataView(buf);

  view.setInt8(0, (bool ? 1 : 0), NumberUtility.littleEndian);
  return buf;
}


NumberUtility.floatArrayToBytes = function (arr, size) {
  let buf = new ArrayBuffer(size * arr.length);
  let view = new DataView(buf);

  for (let i = 0; i < arr.length; i++) {
    if (size == 4) {
      view.setFloat32(i*size, arr[i], NumberUtility.littleEndian);
    } else if (size == 8) {
      view.setFloat64(i*size, arr[i], NumberUtility.littleEndian);
    } else {
      throw new Error("Failed to convert bytes to int - invalid integer size (size of " + size + ")");
    }
  }

  return buf;
}

NumberUtility.floatToBytes = function (num, size) {
  let buf = new ArrayBuffer(size);
  let view = new DataView(buf);

  if (size == 4) {
    view.setFloat32(0, num, NumberUtility.littleEndian);
  } else if (size == 8) {
    view.setFloat64(0, num, NumberUtility.littleEndian);
  } else {
    throw new Error("Failed to convert bytes to int - invalid integer size (size of " + size + ")");
  }
  return buf;
}


NumberUtility.intArrayToBytes = function (arr, size) {
  let buf = new ArrayBuffer(size * arr.length);
  let view = new DataView(buf);

  for (let i = 0; i < arr.length; i++) {
    if (size == 1) {
      view.setInt8(i*size, arr[i], NumberUtility.littleEndian);
    } else if (size == 2) {
      view.setInt16(i*size, arr[i], NumberUtility.littleEndian);
    } else if (size == 4) {
      view.setInt32(i*size, arr[i], NumberUtility.littleEndian);
    } else {
      throw new Error("Failed to convert int to bytes - invalid integer size (size of " + size + ")");
    }
  }

  return buf;
}

NumberUtility.intToBytes = function (num, size) {
  let buf = new ArrayBuffer(size);
  let view = new DataView(buf);

  if (size == 1) {
    view.setInt8(0, num, NumberUtility.littleEndian);
  } else if (size == 2) {
    view.setInt16(0, num, NumberUtility.littleEndian);
  } else if (size == 4) {
    view.setInt32(0, num, NumberUtility.littleEndian);
  } else {
    throw new Error("Failed to convert int to bytes - invalid integer size (size of " + size + ")");
  }
  return buf;
}

NumberUtility.uintArrayToBytes = function (arr, size) {
  let buf = new ArrayBuffer(size * arr.length);
  let view = new DataView(buf);

  for (let i = 0; i < arr.length; i++) {
    if (size == 1) {
      view.setUint8(i*size, arr[i], NumberUtility.littleEndian);
    } else if (size == 2) {
      view.setUint16(i*size, arr[i], NumberUtility.littleEndian);
    } else if (size == 4) {
      view.setUint32(i*size, arr[i], NumberUtility.littleEndian);
    } else {
      throw new Error("Failed to convert int to bytes - invalid integer size (size of " + size + ")");
    }
  }

  return buf;
}

NumberUtility.uintToBytes = function (num, size) {
  let arr = new ArrayBuffer(size);
  let view = new DataView(arr);

  if (size == 1) {
    view.setUint8(0, num, NumberUtility.littleEndian);
  } else if (size == 2) {
    view.setUint16(0, num, NumberUtility.littleEndian);
  } else if (size == 4) {
    view.setUint32(0, num, NumberUtility.littleEndian);
  } else {
    throw new Error("Failed to convert int to bytes - invalid integer size (size of " + size + ")");
  }
  return arr;
}

// String Utility
function StringUtility() {}

StringUtility.StringToUint8Array = function (str, buffer) {
  if (typeof buffer === 'undefined') {
    buffer = new Uint8Array(str.length);
  }

  for (var i = 0, strLen = str.length; i < strLen; i++) {
    var char = str.charCodeAt(i);

    if (char > 255) {
      // Only ASCII are supported at the moment, a '?' is used instead of unsupported chars
      buffer[i] = "?".charCodeAt();
    } else {
      buffer[i] = char;
    }
  }

  return buffer;
}

StringUtility.Uint8ArrayToString = function(buffer) {
  return String.fromCharCode.apply(null, buffer);
}