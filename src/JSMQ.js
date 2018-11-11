/**
 * WebSocket connection state
 */
const ConnectionState = Object.freeze({
  closed:                 1,
  connecting:             2,
  open:                   3,
});

/**
 * Class representing a WebSocket endpoint
 * @param {string} address - The endpoint address (ex: "ws://127.0.0.1:15798")
 */
class Endpoint {
  constructor(address) {
    this.address = address;
    this.incomingMessage = null;
    this.connectionRetries = 0;
    this.connectionState = ConnectionState.closed;
    this.webSocket = null;
    
    this.activated = null;
    this.deactivated = null;
    this.isOpen = () => this.connectionState == ConnectionState.open;
    
    this.open = this.open.bind(this);
    this.onclose = this.onclose.bind(this);
    this.onmessage = this.onmessage.bind(this);
    this.onopen = this.onopen.bind(this);
    this.processFrame = this.processFrame.bind(this);
    this.write = this.write.bind(this);
    
    console.log("Connecting to \"" + this.address + "\"");
    this.open();
  }
  
  /**
   * Open a WebSocket connection to the endpoint address
   */
  open() {
    if (this.webSocket != null) {
      this.webSocket.onopen = null;
      this.webSocket.onclose = null;
      this.webSocket.onmessage = null;
    }

    this.outgoingArray = [];

    this.webSocket = new window.WebSocket(this.address, ["WSNetMQ"]);
    this.webSocket.binaryType = "arraybuffer";
    this.connectionState = ConnectionState.connecting;

    this.webSocket.onopen = this.onopen;
    this.webSocket.onclose = this.onclose;
    this.webSocket.onmessage = this.onmessage;

    this.connectionRetries++;
  }

  /**
   * Callback on WebSocket connection opened
   *
   * On open, perform activated actions, set endpoint state to open.
   *
   * @param {*} event
   */
  onopen(e) {
    console.log("WebSocket connection to \"" + this.address + "\" established");
    this.connectionRetries = 0;

    this.connectionState = ConnectionState.open;
    if (this.activated != null) {
      this.activated(this);
    }
  }

  /**
   * Callback on WebSocket connection closed
   *
   * On close, perform deactivated actions, set state to ClosedState.
   * Attempts to reconnect, until the number of reconnect tries exceeds the reconnect try limit.
   *
   * @param {*} event
   */
  onclose(e) {
    console.log("WebSocket connection to \"" + this.address + "\" closed");
    let previousState = this.connectionState;
    this.connectionState = ConnectionState.closed;

    if (previousState == ConnectionState.open && this.deactivated != null) {
      this.deactivated(this);
    }

    if (this.connectionRetries > 10) {
      window.setTimeout(this.open, 2000);
    } else {
      this.open();
    }
  }

  /**
   * Callback on WebSocket message received
   *
   * Attempt to parse the received message.
   * Parse raw blobs to ArrayBuffer before parsing frames.
   *
   * @param {*} event - The message event
   */
  onmessage(event) {
    // Parse blobs
    if (event.data instanceof Blob) {
      let arrayBuffer;
      let fileReader = new FileReader();
      fileReader.onload = function () {
        this.processFrame(this.result);
      };
      fileReader.readAsArrayBuffer(event.data);

    // Parse ArrayBuffer
    } else if (event.data instanceof ArrayBuffer) {
      this.processFrame(event.data);

    // Other message types are not supported and will be dropped
    } else {
      throw ("Could not parse message -- unsupported message type");
    }
  }

  /**
   * Process a message frame, adding the data as an ArrayBuffer to its list of frames
   *
   * @param {ArrayBuffer} frame
   */
  processFrame(frame) {
    const view = new Uint8Array(frame);
    const more = view[0];
    
    if (this.incomingMessage == null) {
      this.incomingMessage = new Message();
    }
    
    this.incomingMessage.addBuffer(view.subarray(1));
    
    // last message
    if (more == 0) {
      if (this.onMessage != null) {
        this.onMessage(this, this.incomingMessage);
      }

      this.incomingMessage = null;
    }
  }

  /**
   * Write message to wire
   *
   * Each frame is sent as a separate message over WebSocket.
   * The ZWSSock reconstructs the final message from the series of separate messages.
   * A "message continued" byte is prepended to each message to indicate whether there are additional
   * frames coming over the wire.
   *
   * @param {Message} message - Message to write to wire
   */
  write(message) {
    const messageSize = message.getSize();

    for (let j = 0; j < messageSize; j++) {
      const frame = message.getFrame(j);

      let data = new Uint8Array(frame.byteLength + 1);
      data[0] = j == messageSize - 1 ? 0 : 1; // set the message continued byte
      data.set(new Uint8Array(frame), 1);

      this.webSocket.send(data);
    }
  }
}

/**
 * Class acting as Load Balancer
 */
class LoadBalancer {
  constructor () {
    this.current = 0;
    this.endpoints = [];
    this.isActive = false;
    this.writeActivated = null;

    this.attach = this.attach.bind(this);
    this.getHasOut = this.getHasOut.bind(this);
    this.send = this.send.bind(this);
    this.terminated = this.terminated.bind(this);
  }
  /**
   * Attach: add an endpoint to list of endpoints
   * @param {Endpoint} endpoint - The endpoint to attach to
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
   */
  getHasOut() {
    if (this.inprogress) {
      return true;
    }

    return this.endpoints.length > 0;
  }

  /**
   * Send message over current the endpoint
   * @param {Message} message - The message to send
   * @return {Boolean} - Success
   */
  send(message) {
    if (this.endpoints.length == 0) {
      this.isActive = false;
      throw ("Failed to send message - no valid endpoints");
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
  terminated(endpoint) {
    const index = this.endpoints.indexOf(endpoint);

    if (this.current == this.endpoints.length - 1) {
      this.current = 0;
    }

    this.endpoints.splice(index, 1);
  }
}

/**
 * ZWSSocket
 */
export class ZWSSocket {
  constructor () {
    this.endpoints = [];
    this.onMessage = null;
    this.sendReady = null;

    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.getHasOut = this.getHasOut.bind(this);
    this.onEndpointActivated = this.onEndpointActivated.bind(this);
    this.onEndpointDeactivated = this.onEndpointDeactivated.bind(this);
    this.send = this.send.bind(this);
  };
  
  connect(address) {
    let endpoint = new Endpoint(address);
    endpoint.activated = this.onEndpointActivated;
    endpoint.deactivated = this.onEndpointDeactivated;
    endpoint.onMessage = this.xonMessage;
    this.endpoints.push(endpoint);
  };
  
  disconnect(address) {
    // UNIMPLEMENTED
    throw ("Failed to disconnect - disconnect UNIMPLEMENTED");
  };
  
  getHasOut() {
    return xhasOut();
  };

  onEndpointActivated(endpoint) {
    this.xattachEndpoint(endpoint);
  }

  onEndpointDeactivated(endpoint) {
    this.xendpointTerminated(endpoint);
  }

  send(message) {
    return this.xsend(message);
  };
}

/**
 * Class representing a ZeroMQ DEALER type socket
 */
export class Dealer extends ZWSSocket {
  constructor() {
    super();
    this.lb = new LoadBalancer();
    this.lb.writeActivated = function() {
      if (this.sendReady != null) {
        this.sendReady();
      }
    }.bind(this);

    this.xattachEndpoint = this.xattachEndpoint.bind(this);
    this.xendpointTerminated = this.xendpointTerminated.bind(this);
    this.xhasOut = this.xhasOut.bind(this);
    this.xonMessage = this.xonMessage.bind(this);
    this.xsend = this.xsend.bind(this);
  };

  xattachEndpoint(endpoint) {
    this.lb.attach(endpoint);
  }

  xendpointTerminated(endpoint) {
    this.lb.terminated(endpoint);
  }

  xhasOut() {
    return this.lb.getHasOut();
  }
  
  xonMessage(endpoint, message) {
    if (this.onMessage != null) {
      this.onMessage(message);
    }
  }
  
  xsend(message) {
    return this.lb.send(message);
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
    subscriptions.push(subscription)

    const message = createSubscriptionMessageReceived(subscription, true);

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

    for (var j = 0; j < subscriptions.length; j++) {

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

    var message = createSubscriptionMessageReceived(subscription, false);

    for (var i = 0; i < this.endpoints.length; i++) {
      this.endpoints[i].write(message);
    }
  };
  

  /**
   * TODO
   * @param {*} subscription
   * @param {*} subscribe
   */
  createSubscriptionMessageReceived(subscription, subscribe) {
    var frame = new Uint8Array(subscription.length + 1);
    frame[0] = subscribe ? 1 : 0;
    frame.set(subscription, 1);

    var message = new Message();
    message.addBuffer(frame);

    return message;
  }

  xattachEndpoint(endpoint) {
    this.endpoints.push(endpoint);

    for (var i = 0; i < subscriptions.length; i++) {
      var message = createSubscriptionMessageReceived(subscriptions[i], true);

      endpoint.write(message);
    }

    if (!isActive) {
      isActive = true;

      if (this.sendReady != null) {
        this.sendReady();
      }
    }
  }

  xendpointTerminated(endpoint) {
    var index = endpoints.indexOf(endpoint);
    endpoints.splice(index, 1);
  }

  xhasOut() {
    return false;
  }

  xsend(message, more) {
    throw ("Send not supported on SUB type socket");
  }

  xonMessage(endpoint, message) {
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

    this.getSize = this.getSize.bind(this);

    this.addBuffer = this.addBuffer.bind(this);
    this.addDouble = this.addDouble.bind(this);
    this.addInt16 = this.addInt16.bind(this);
    this.addInt32 = this.addInt32.bind(this);
    this.addUint16 = this.addUint16.bind(this);
    this.addUint32 = this.addUint32.bind(this);
    this.addString = this.addString.bind(this);

    this.getBuffer = this.getBuffer.bind(this);
    this.getDouble = this.getDouble.bind(this);
    this.getFrame = this.getFrame.bind(this);
    this.getInt16 = this.getInt16.bind(this);
    this.getInt32 = this.getInt32.bind(this);
    this.getUint16 = this.getUint16.bind(this);
    this.getUint32 = this.getUint32.bind(this);
    this.getString = this.getString.bind(this);

    this.popDouble = this.popDouble.bind(this);
    this.popInt16 = this.popInt16.bind(this);
    this.popInt32 = this.popInt32.bind(this);
    this.popUint16 = this.popUint16.bind(this);
    this.popUint32 = this.popUint32.bind(this);
    this.popString = this.popString.bind(this);
    this.prependString = this.prependString.bind(this);
  }

  /**
   * Get size in number of frames
   * @return {number} - number of frames
   */
  getSize() {
    return this.frames.length;
  }

  /**
   * Append a buffer to the end of the message
   * @param {ArrayBuffer} buffer - Buffer of data to append
   */
  addBuffer(data) {
    if (data instanceof ArrayBuffer) {
      this.frames.push(data);

    } else if (data instanceof Uint8Array) {
      this.frames.push(data.buffer);

    } else {
      throw ("Failed to add buffer to message - unknown buffer type \"" + typeof buffer + "\"");
    }
  }

  /**
   * Append a double to the end of the message
   * @param {number} number - Double to append
   */
  addDouble(number) {
    this.addBuffer(NumberUtility.doubleToByteArray(number));
  }

  /**
   * Append a 16 bit integer to the end of the message
   * @param {number} number - Int to append
   */
  addInt16(number) {
    this.addBuffer(NumberUtility.int16ToByteArray(number));
  }

  /**
   * Append a 32 bit integer to the end of the message
   * @param {number} number - Int to append
   */
  addInt32(number) {
    this.addBuffer(NumberUtility.int32ToByteArray(number));
  }

  /**
   * Append a 16 bit unsigned integer to the end of the message
   * @param {number} number - Int to append
   */
  addUint16(number) {
    this.addBuffer(NumberUtility.uint16ToByteArray(number));
  }

  /**
   * Append a 32 bit unsigned integer to the end of the message
   * @param {number} number - Int to append
   */
  addUint32(number) {
    this.addBuffer(NumberUtility.uint32ToByteArray(number));
  }

  /**
   * Append a string to the end of the message
   * @param {string} str - String to append
   */
  addString(str) {
    str = String(str);

    // A byte is saved for the "message continued" byte
    let arr = new Uint8Array(str.length);

    StringUtility.StringToUint8Array(str, arr);
    this.addBuffer(arr);
  }

  /**
   * Get the frame at the specified location
   * @param {number} i - Frame to retrieve
   * @return {ArrayBuffer} - Frame payload
   */
  getBuffer(frame) {
    // Remove the prepended "message contframenued" byte from the payload
    return this.frames[frame].slice(1);
  }

  /**
   * Get the frame at the specified location
   * @param {number} i - Frame to retrieve
   * @return {ArrayBuffer} - Frame payload
   */
  getFrame(i) {
    // Remove the prepended "message continued" byte from the payload
    return this.frames[i];
  }

  /**
   * Get a double at the specified frame location
   * @param {*} i
   */
  getDouble(i) {
    return NumberUtility.byteArrayToDouble(this.getBuffer(i));
  }

  /**
   * Get a 16 bit integer at the specified frame location
   * @param {*} i
   */
  getInt16(i) {
    return NumberUtility.byteArrayToInt16(this.getBuffer(i));
  }

  /**
   * Get a 32 bit integer at the specified frame location
   * @param {*} i
   */
  getInt32(i) {
    return NumberUtility.byteArrayToInt32(this.getBuffer(i));
  }

  /**
   * Get a 16 bit unsigned integer at the specified frame location
   * @param {*} i
   */
  getUint16(i) {
    return NumberUtility.byteArrayToUint16(this.getBuffer(i));
  }

  /**
   * Get a 32 bit unsigned integer at the specified frame location
   * @param {*} i
   */
  getUint32(i) {
    return NumberUtility.byteArrayToUint32(this.getBuffer(i));
  }

  /**
   * Get a string at the specified frame location
   * @param {*} i
   */
  getString(i) {
    return StringUtility.Uint8ArrayToString(new Uint8Array(this.getBuffer(i)));
  }

  /**
   * Pop the first frame of the message, as an ArrayBuffer
   * @return {ArrayBuffer} - Frame payload
   */
  popFrame() {
    var frame = this.frames[0];
    this.frames.splice(0, 1);

    // Remove the prepended "message continued" byte from the payload
    return frame.slice(1);
  }

  /**
   * Pop the first frame of the message, as a double
   * @return {double}
   */
  popDouble() {
    const frame = this.popFrame();
    return NumberUtility.byteArrayToDouble(frame);
  }

  /**
   * Pop the first frame of the message, as a 16 bit integer
   * @return {number}
   */
  popInt16() {
    const frame = this.popFrame();
    return NumberUtility.byteArrayToInt16(frame);
  }

  /**
   * Pop the first frame of the message, as a 32 bit integer
   * @return {number}
   */
  popInt32() {
    const frame = this.popFrame();
    return NumberUtility.byteArrayToInt32(frame);
  }

  /**
   * Pop the first frame of the message, as a 16 bit signed integer
   * @return {number}
   */
  popUint16() {
    const frame = this.popFrame();
    return NumberUtility.byteArrayToUint16(frame);
  }

  /**
   * Pop the first frame of the message, as a 32 bit signed integer
   * @return {number}
   */
  popUint32() {
    const frame = this.popFrame();
    return NumberUtility.byteArrayToUint32(frame);
  }

  /**
   * Pop the first frame of the message, as a string
   * @return {string}
   */
  popString() {
    const frame = this.popFrame();
    return StringUtility.Uint8ArrayToString(new Uint8Array(frame));
  }

  /**
   * Insert a string at the beginning of the message
   * @param {string} str
   */
  prependString(str) {
    str = String(str);

    var arr = new Uint8Array(str.length);

    StringUtility.StringToUint8Array(str, arr);

    this.frames.splice(0, 0, arr.buffer);
  }
}

// Number Utility
function NumberUtility() {}

NumberUtility.littleEndian = true;

NumberUtility.byteArrayToDouble = function (arr) {
  view = new DataView(arr);
  return view.getFloat64(0, NumberUtility.littleEndian);
}

NumberUtility.byteArrayToInt16 = function (arr) {
  view = new DataView(arr);
  return view.getInt16(0, NumberUtility.littleEndian);
}

NumberUtility.byteArrayToInt32 = function (arr) {
  view = new DataView(arr);
  return view.getInt32(0, NumberUtility.littleEndian);
}

NumberUtility.byteArrayToUint16 = function (arr) {
  view = new DataView(arr);
  return view.getUint16(0, NumberUtility.littleEndian);
}

NumberUtility.byteArrayToUint32 = function (arr) {
  view = new DataView(arr);
  return view.getUint32(0, NumberUtility.littleEndian);
}

NumberUtility.doubleToByteArray = function (num) {
  arr = new ArrayBuffer(8);
  view = new DataView(arr);
  view.setFloat64(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.int16ToByteArray = function (num) {
  arr = new ArrayBuffer(2);
  view = new DataView(arr);
  view.setInt16(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.int32ToByteArray = function (num) {
  arr = new ArrayBuffer(4);
  view = new DataView(arr);
  view.setInt16(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.uint16ToByteArray = function (num) {
  arr = new ArrayBuffer(2);
  view = new DataView(arr);
  view.setUint16(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.uint32ToByteArray = function (num) {
  arr = new ArrayBuffer(4);
  view = new DataView(arr);
  view.setUint16(0, num, NumberUtility.littleEndian);
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