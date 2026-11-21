/* server/lib/botmode.js — v2.12. The v14.0 Bot Mode driver that lived here was
   orphaned when the bots were removed in v1.0d (it called an engine that no
   longer existed and nothing required it). Bot Ops (v2.12) is a new build:
     server/lib/botnav.js   the walk graph and line of sight
     server/lib/botai.js    the operators, and the match lifecycle
   This file is kept only so the path still resolves. */
'use strict';
module.exports = require('./botai.js');
