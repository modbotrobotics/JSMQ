# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2018-12-13

### Fixed

- Fixed response callback / message queues not being cleared on all endpoints disconnected in Dealer socket


## [0.1.2] - 2018-11-28

### Added

- Forked repository from [zeromq/JSMQ](https://github.com/zeromq/JSMQ)
- Added `Endpoint.close(code, reason)`
- Added `Message.getFloat(i, size)`
- Added `Message.getInt(i, size)`
- Added `Message.getString(i)`
- Added `Message.insertFloat(i, number, size)`
- Added `Message.insertInt(i, number, size)`
- Added `Message.insertString(i, str)`
- Added `Message.popFloat()`
- Added `Message.popInt(size)`
- Added `Message.popString(size)`
- Added `ZWSSock.disconnect(address)`
- Added `NumberUtility` namespace and helper functions
- Added string format support for `Endpoint`'s `processFrames()` (to Uint8Array)
- Added the ability to partially parse frames (of multiple floats, ints, etc.)
- Initialized node package, `package.json`
- Added Babel, Jest, Mock-Socket as node package dependencies (for testing)
- Added Dealer tests
- Added Message tests

### Changed

- Refactored directory structure
- Updated `README.md`
- JSMQ Message frames now stored as `ArrayBuffer` rather than `Uint8Array`
