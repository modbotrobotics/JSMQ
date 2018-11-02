# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).


## [1.0.0] - 2018-11-1

### Added

- Forked repository from [zeromq/JSMQ](https://github.com/zeromq/JSMQ)
- Added `JSMQ.Message.getDouble()`
- Added `JSMQ.Message.getInt()`
- Added `JSMQ.Message.getLong()`
- Added `JSMQ.Message.getString()`
- Added `JSMQ.Message.popDouble()`
- Added `JSMQ.Message.popInt()`
- Added `JSMQ.Message.popLong()`
- Added `JSMQ.Message.popString()`
- Added `NumberUtility` namespace and helper functions

### Changed

- Refactored directory structure
- Updated `README.md`
- JSMQ Message frames now stored as `ArrayBuffer` rather than `Uint8Array`
