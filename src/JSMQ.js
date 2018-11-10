/**
 * Class representing a WebSocket endpoint
 * @param {string} address - The endpoint address (ex: "ws://127.0.0.1:15798")
 */
class Endpoint {
  constructor(address) {
    let ConnectionState = Object.freeze({
      closed:                 1,
      connecting:             2,
      open:                   3,
    });

    this.address = address;
    this.incomingMessage = null;
    this.connectionRetries = 0;
    this.connectionState = ConnectionState.closed;
    this.webSocket = null;
    
    this.activated = null;
    this.deactivated = null;
    this.onMessage = null;
    this.isOpen = () => this.connectionState == ConnectionState.open;
    
    console.log("Connecting to \"" + address + "\"");
    open();
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

    this.webSocket = new window.WebSocket(address, ["WSNetMQ"]);
    this.webSocket.binaryType = "arraybuffer";
    this.connectionState = ConnectionState.connecting;

    this.webSocket.onopen = onOpen;
    this.webSocket.onclose = onClose;
    this.webSocket.onmessage = onMessage;

    this.connectionRetries++;
  }

  /**
   * Callback on WebSocket connection opened
   *
   * On open, perform activated actions, set endpoint state to open.
   *
   * @param {*} event
   */
  onOpen(e) {
    console.log("WebSocket connection to \"" + address + "\" established");
    this.connectionRetries = 0;

    this.connectionState = ConnectionState.open;
    if (this.activated != null) {
      this.activated();
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
  onClose(e) {
    console.log("WebSocket connection to \"" + address + "\" closed");
    let previousState = state;
    this.connectionState = ConnectionState.closed;

    if (previousState == ConnectionState.open && this.deactivated != null) {
      this.deactivated();
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
  onMessage(event) {
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
      console.log("Could not parse message -- unsupported message type");
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
      const frame = message.getPackagedFrame(j);

      let data = new Uint8Array(frame.byteLength + 1);
      data[0] = j == messageSize - 1 ? 0 : 1; // set the message continued byte
      data.set(new Uint8Array(frame), 1);

      webSocket.send(data);
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
  }
  /**
   * Attach: add an endpoint to list of endpoints
   * @param {Endpoint} endpoint - The endpoint to attach to
   */
  attach(endpoint) {
    this.endpoints.push(endpoint);

    if (!this.isActive) {
      this.isActive = true;

      if (this.writeActivated != null)
      this.writeActivated();
    }
  }

  /**
   * Terminate: remove an endpoint from list of endpoints
   * @param {Endpoint} endpoint
   */
  terminated(endpoint) {
    const index = endpoints.indexOf(endpoint);

    if (this.current == endpoints.length - 1) {
      this.current = 0;
    }

    this.endpoints.splice(index, 1);
  }

  /**
   * Send message over current the endpoint
   * @param {Message} message - The message to send
   * @return {Boolean} - Success
   */
  send(message) {
    if (this.endpoints.length == 0) {
      this.isActive = false;
      console.log("Failed to send message - no valid endpoints");
      return false;
    }

    this.endpoints[this.current].write(message);
    this.current = (this.current + 1) % this.endpoints.length;

    return true;
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
}

/**
 * ZWSSocket
 */
export class ZWSSocket {
  constructor () {
    this.endpoints = [];
    this.onMessage = null;
    this.sendReady = null;
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
    console.log("Failed to disconnect - disconnect UNIMPLEMENTED");
  };
  
  getHasOut() {
    return xhasOut();
  };

  onEndpointActivated(endpoint) {
    xattachEndpoint(endpoint);
  }

  onEndpointDeactivated(endpoint) {
    xendpointTerminated(endpoint);
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
      if (sendReady != null) {
        sendReady(socket);
      }
    };
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

  xsend(message) {
    return this.lb.send(message);
  }

  xonMessage(endpoint, message) {
    if (onMessage != null) {
      onMessage(message);
    }
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

    const message = createSubscriptionMessage(subscription, true);

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

    var message = createSubscriptionMessage(subscription, false);

    for (var i = 0; i < this.endpoints.length; i++) {
      this.endpoints[i].write(message);
    }
  };
  

  /**
   * TODO
   * @param {*} subscription
   * @param {*} subscribe
   */
  createSubscriptionMessage(subscription, subscribe) {
    var frame = new Uint8Array(subscription.length + 1);
    frame[0] = subscribe ? 1 : 0;
    frame.set(subscription, 1);

    var message = new Message();
    message.addBuffer(frame);

    return message;
  }

  xattachEndpoint(endpoint) {
    endpoints.push(endpoint);

    for (var i = 0; i < subscriptions.length; i++) {
      var message = createSubscriptionMessage(subscriptions[i], true);

      endpoint.write(message);
    }

    if (!isActive) {
      isActive = true;

      if (socket.sendReady != null) {
        socket.sendReady(socket);
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
    throw new "Send not supported on sub socket";
  }

  xonMessage(endpoint, message) {
    if (socket.onMessage != null) {
      socket.onMessage(message);
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
   * Append an int to the end of the message
   * @param {number} number - Int to append
   */
  addInt(number) {
    this.addBuffer(NumberUtility.intToByteArray(number));
  }

  /**
   * Append a long int to the end of the message
   * @param {number} number - Long to append
   */
  addLong(number) {
    this.addBuffer(NumberUtility.longToByteArray(number));
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
  getFrame(frame) {
    // Remove the prepended "message contframenued" byte from the payload
    return this.frames[frame].slice(1);
  }

  /**
   * Get the frame at the specified location
   * @param {number} i - Frame to retrieve
   * @return {ArrayBuffer} - Frame payload
   */
  getPackagedFrame(i) {
    // Remove the prepended "message continued" byte from the payload
    return this.frames[i];
  }

  /**
   * Get a double at the specified frame location
   * @param {*} i
   */
  getDouble(i) {
    return NumberUtility.byteArrayToDouble(this.getFrame(i));
  }

  /**
   * Get an int at the specified frame location
   * @param {*} i
   */
  getInt(i) {
    return NumberUtility.byteArrayToInt(this.getFrame(i));
  }

  /**
   * Get a long int at the specified frame location
   * @param {*} i
   */
  getLong(i) {
    return NumberUtility.byteArrayToLong(this.getFrame(i));
  }

  /**
   * Get a string at the specified frame location
   * @param {*} i
   */
  getString(i) {
    return StringUtility.Uint8ArrayToString(new Uint8Array(this.getFrame(i)));
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
   * Pop the first frame of the message, as an int
   * @return {int}
   */
  popInt() {
    const frame = this.popFrame();
    return NumberUtility.byteArrayToInt(frame);
  }

  /**
   * Pop the first frame of the message, as a long int
   * @return {long}
   */
  popLong() {
    const frame = this.popFrame();
    return NumberUtility.byteArrayToLong(frame);
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

NumberUtility.intToByteArray = function (num) {
  arr = new ArrayBuffer(2);
  view = new DataView(arr);
  view.setInt16(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.byteArrayToInt = function (arr) {
  view = new DataView(arr);
  return view.getInt16(0, NumberUtility.littleEndian);
}

NumberUtility.longToByteArray = function (num) {
  arr = new ArrayBuffer(4);
  view = new DataView(arr);
  view.setInt32(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.byteArrayToLong = function (arr) {
  view = new DataView(arr);
  return view.getInt32(0, NumberUtility.littleEndian);
}

NumberUtility.doubleToByteArray = function (num) {
  arr = new ArrayBuffer(64);
  view = new DataView(arr);
  view.setFloat64(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.byteArrayToDouble = function (arr) {
  view = new DataView(arr);
  return view.getFloat64(0, NumberUtility.littleEndian);
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