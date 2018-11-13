# JSMQ - ZeroMQ over Websockets & Javascript

Forked from [zeromq/JSMQ](https://github.com/zeromq/JSMQ).


## JSMQ

JSMQ is a javascript extension for ZeroMQ over WebSockets.
JSMQ currently implements the DEALER and SUBSCRIBER patterns.

ZeroMQ doesn't have a WebSockets transport at the moment, however an extension already exists for [CZMQ](https://github.com/ZeroMQ/zwssock) (forked to [modbotrobotics/zwssock](https://github.com/modbotrobotics/zwssock)).

### Additional Information

- [ZeroMQ REQ/REP (DEALER RFC)](https://rfc.zeromq.org/spec:28/REQREP/)
- [ZeroMQ PUB/SUB RFC](https://rfc.zeromq.org/spec:29/PUBSUB)
- [ZeroMQ ZWS RFC](https://rfc.zeromq.org/spec:39/ZWS)


## Usage

You can download the JSMQ.js library directly from this repository.
The JSMQ API is very similar to other high level bindings of ZeroMQ.

Please see the `example.html` for an example on how to use this library.


## Testing

Tests are written with [the Jest testing framework](https://jestjs.io).
To run the test suites, run:
- `npm i` to install modules, if necessary,
- `npm test`.