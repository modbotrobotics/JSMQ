# JSMQ - ZeroMQ over Websockets & Javascript

Forked from [zeromq/JSMQ](https://github.com/zeromq/JSMQ).


## JSMQ

JSMQ is a javascript extension for ZeroMQ over WebSockets.
JSMQ currently implements the DEALER and SUBSCRIBER patterns.

ZeroMQ doesn't have a WebSockets transport at the moment, however an extension already exists for [CZMQ](https://github.com/ZeroMQ/zwssock) (forked to [modbotrobotics/zwssock](https://github.com/modbotrobotics/zwssock)).

For browsers without WebSockets support ([RFC6455](http://tools.ietf.org/html/rfc6455)), you can try to use [web-socket-js](https://github.com/gimite/web-socket-js).


## Usage

You can download the JSMQ.js library directly from this repository.
Using JSMQ is very similar to using other high level bindings of ZeroMQ. 

Below is a small example:

```html
<html>
    <meta charset="utf-8"/>
    <script src="../src/JSMQ.js"></script>
    <script>
        var dealer = new JSMQ.Dealer();
        dealer.connect("ws://127.0.0.1:15798");

        // We must wait for the dealer to be connected before we can send messages,
        //  any messages we are trying to send while the dealer is not connected will be dropped
        dealer.sendReady = function() {
            document.getElementById("sendButton").disabled = "";
        };

        var subscriber = new JSMQ.Subscriber();
        subscriber.connect("ws://localhost:15799");
        subscriber.subscribe("chat");

        subscriber.onMessage = function (message) {

            // we ignore the first frame because it's topic
            message.popString();

            document.getElementById("chatTextArea").value =
                document.getElementById("chatTextArea").value +
                message.popString()  + "\n";
        };

        dealer.onMessage = function (message) {
            // Callback executed on response received from the server
            console.log("Received: \""+ message.popString() + "\",",
            message.popInt(),
            message.popInt(),
            message.popLong(),
            message.popLong(),
            message.popDouble(),
            message.popDouble());
        };

        function send() {
            var message = new JSMQ.Message();
            message.addString(document.getElementById("messageTextBox").value);
            message.addString("Hello");
            message.addInt(1234);
            message.addInt(-1234);
            message.addLong(1234567);
            message.addLong(-1234567);
            message.addDouble(12345678.87654321);
            message.addDouble(-12345678.87654321);

            dealer.send(message);
        }

        function onInputKeyPress(e) {
            var unicode = e.keyCode ? e.keyCode : e.charCode;
            if (unicode == 13)
              send();
        }
    </script>
    <body>
        <textarea id="chatTextArea" readonly="readonly"></textarea>
        <br/>
        <label>Message:</label><input id="messageTextBox" value="" onkeypress="onInputKeyPress(event)"/>
        <button id="sendButton" disabled="disabled" onclick="javascript:send();">
            Send
        </button>
    </body>
</html>

```



