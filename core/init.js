'use strict';

var Context = /** @type Context */ require('./context');
var FistError = /** @type FistError */ require('./fist-error');
var LRUDictTtlAsync = /** @type LRUDictTtlAsync */ require('./cache/lru-dict-ttl-async');
var Obus = /** @type Obus */ require('obus');

var _ = require('lodash-node');
var f = require('util').format;
var hasProperty = Object.prototype.hasOwnProperty;
var inherit = require('inherit');
var vow = require('vow');

function init(agent) {
    /*eslint max-params: 0*/

    /**
     * @public
     * @memberOf agent
     * @property
     * @type {Object}
     * */
    agent.caches = {

        /**
         * default cache interface "local"
         *
         * @public
         * @memberOf agent.caches
         * @property
         * @type {LRUDictTtlAsync}
         * */
        local: new LRUDictTtlAsync(0xffff)
    };

    /**
     * Common Fist Unit interface
     * @class Unit
     * */
    function Unit() {
        //  check dependencies issues
        assertDepsOk(agent.getUnitClass(this.name), []);

        /**
         * @public
         * @memberOf {Unit}
         * @property
         * @type {Object}
         * */
        this.params = _.extend({}, this.params);

        if (!_.has(agent.caches, this.cache)) {
            throw new FistError('UNKNOWN_CACHE', f('You should define app.caches[%j] interface', this.cache));
        }

        /**
         * @protected
         * @memberOf {Unit}
         * @method
         * @property
         * */
        this._cache = agent.caches[this.cache];

        /**
         * @protected
         * @memberOf {Unit}
         * @property
         * @type {Object}
         * */
        this._deps = _.uniq(this.deps);

        /**
         * @protected
         * @memberOf {Unit}
         * @property
         * @type {Object}
         * */
        this._depsNames = {};

        _.forEach(this._deps, function (name) {
            this._depsNames[name] = _.has(this.depsMap, name) ?
                this.depsMap[name] : name;
        }, this);

        /**
         * @protected
         * @memberOf {Unit}
         * @property
         * @type {Object}
         * */
        this._depsArgs = {};

        _.forEach(this._deps, function (name) {
            if (_.has(this.depsArgs, name)) {
                if (_.isFunction(this.depsArgs[name])) {
                    this._depsArgs[name] = this.depsArgs[name];
                } else {
                    this._depsArgs[name] = function () {
                        return this.depsArgs[name];
                    };
                }
            } else {
                this._depsArgs[name] = function () {};
            }
        }, this);
    }

    Unit.prototype = {

        /**
         * @public
         * @memberOf {Unit}
         * @method
         *
         * @constructs
         * */
        constructor: Unit,

        /**
         * @public
         * @memberOf {Unit}
         * @property
         * */
        name: 0,

        /**
         * @public
         * @memberOf {Unit}
         * @property
         * @type {String}
         * */
        cache: 'local',

        /**
         * @public
         * @memberOf {Unit}
         * @property
         * @type {Number}
         * */
        maxAge: 0,

        /**
         * @public
         * @memberOf {Unit}
         * @property
         * @type {Object}
         * */
        params: {},

        /**
         * @public
         * @memberOf {Unit}
         * @property
         * @type {Object}
         * */
        depsArgs: {},

        /**
         * @public
         * @memberOf {Unit}
         * @property
         * @type {Object}
         * */
        depsMap: {},

        /**
         * @public
         * @memberOf {Unit}
         * @property
         * @type {Array}
         * */
        deps: [],

        /**
         * @public
         * @memberOf {Unit}
         * @method
         *
         * @param {Object} track
         * @param {Object} context
         *
         * @returns {*}
         * */
        call: function (track, context) {
            var dStartExec = new Date();
            var result;

            context.logger.debug('Pending...');

            result = fetch(this, track, context);

            result.done(function (res) {
                var execTime = new Date() - dStartExec;
                if (res) {
                    context.logger.debug('Accepted in %dms', execTime);
                } else {
                    context.logger.debug('Skip result in %dms', execTime);
                }
            }, function (err) {
                var execTime = new Date() - dStartExec;
                if (track.isFlushed()) {
                    context.logger.warn('Skip error in %dms', execTime, err);
                } else {
                    context.logger.error('Rejected in %dms', execTime, err);
                }
            });

            return result;
        },

        /**
         * @public
         * @memberOf {Unit}
         * @method
         *
         * @param {Object} track
         * @param {Object} context
         *
         * @returns {*}
         * */
        hashArgs: function (track, context) {
            /*eslint no-unused-vars: 0*/
            return 'none';
        },

        /**
         * @public
         * @memberOf {Unit}
         * @method
         *
         * @param {Object} track
         * @param {*} [args]
         *
         * @returns {Object}
         * */
        createContext: function (track, args) {
            var context = new Context(track.logger.bind(this.name));
            context.params = _.extend({}, this.params, track.params, args);
            context.argsHash = this.hashArgs(track, context);
            return context;
        },

        /**
         * @public
         * @memberOf {Unit}
         * @method
         *
         * @param {Object} track
         * @param {Object} context
         *
         * @returns {*}
         * */
        main: /* istanbul ignore next */ function (track, context) {
            /*eslint no-unused-vars: 0*/
        }

    };

    /**
     * @public
     * @static
     * @memberOf {Unit}
     * @method
     *
     * @param {Object} [members]
     * @param {Object} [statics]
     *
     * @returns {Function}
     * */
    Unit.inherit = function (members, statics) {
        var deps = this.prototype.deps;
        var mixins = [];

        members = Object(members);

        if (members.deps) {
            deps = deps.concat(members.deps);
        }

        if (members.mixins) {
            mixins = mixins.concat(members.mixins);
        }

        members.deps = _.reduce(mixins, function (deps, Mixin) {
            if (_.isFunction(Mixin) && Mixin.prototype.deps) {
                deps = deps.concat(Mixin.prototype.deps);
            }

            return deps;
        }, deps);

        return inherit([this].concat(mixins), members, statics);
    };

    var checked = {};

    function assertDepsOk(Unit, trunk) {

        if (/^[^a-z]/i.test(Unit.prototype.name) || _.has(checked, Unit.prototype.name)) {
            return;
        }

        _.forEach(Unit.prototype.deps, function (name) {
            var Dependency = agent.getUnitClass(name);
            var branch = trunk.concat(name);

            if (!Dependency) {
                throw new FistError(FistError.NO_SUCH_UNIT,
                    f('There is no dependency %j for unit %j', name, Unit.prototype.name));
            }

            if (_.contains(trunk, name)) {
                throw new FistError(FistError.DEPS_CONFLICT,
                    f('Recursive dependencies found: "%s"', branch.join('" < "')));
            }

            assertDepsOk(Dependency, branch);
        });

        checked[Unit.prototype.name] = true;
    }

    function fetch(self, track, context) {
        var dDepsStart = new Date();
        var deps = _.map(self._deps, function (name) {
            var args = self._depsArgs[name].call(self, track, context);
            return agent.callUnit(track, name, args);
        });

        context.keys = new Array(deps.length);
        context.skipCache = false;
        context.needUpdate = false;

        return vow.allResolved(deps).then(function (promises) {
            if (track.isFlushed()) {
                context.logger.debug('The track was flushed by deps, skip invocation');
                return null;
            }

            _.forEach(promises, function (promise, i) {
                var res = promise.valueOf();
                var name = self._depsNames[self._deps[i]];

                if (promise.isRejected()) {
                    context.skipCache = true;
                    Obus.add(context.errors, name, res);
                } else {
                    if (res.updated) {
                        context.needUpdate = true;
                    }
                    context.keys[i] = res.argsHash;
                    Obus.add(context.result, name, res.result);
                }
            });

            context.logger.debug('Deps %j resolved in %dms', self._deps, new Date() - dDepsStart);

            return cache(self, track, context);
        });
    }

    /**
     * @public
     * @memberOf {Agent}
     * @property
     * @type {Function}
     * */
    agent.Unit = Unit;
}

function cache(self, track, context) {
    var argsHash = context.argsHash;

    if (!(self.maxAge > 0) || context.skipCache) {
        return main(self, track, context, argsHash);
    }

    if (context.needUpdate) {
        return set(self, track, context, argsHash);
    }

    return get(self, track, context, argsHash).always(function (promise) {
        var value = promise.valueOf();

        //  has cache
        if (promise.isFulfilled() && value) {
            context.logger.debug('Found in cache');
            value.updated = false;
            return value;
        }

        if (promise.isRejected()) {
            context.logger.warn('Failed to load cache', value);
        } else {
            context.logger.note('Outdated');
        }

        return set(self, track, context, argsHash);
    });
}

function main(self, track, context, argsHash) {
    return vow.invoke(function () {
        return self.main(track, context);
    }).then(function (result) {
        if (track.isFlushed()) {
            context.logger.debug('The track was flushed during execution');
            return null;
        }

        return {
            updated: true,
            result: result,
            argsHash: argsHash
        };
    });
}

function set(self, track, context, argsHash) {
    var promise = main(self, track, context, argsHash);

    promise.then(function (result) {
        var memKey;

        if (result) {
            memKey = self.name + '-' + argsHash + '-' + context.keys.join('-');
            self._cache.set(memKey, result, self.maxAge, function (err) {
                if (err) {
                    context.logger.warn('Failed to set cache', err);
                } else {
                    context.logger.note('Updated');
                }
            });
        }
    });

    return promise;
}

function get(self, track, context, argsHash) {
    var defer = vow.defer();
    var memKey = self.name + '-' + argsHash + '-' + context.keys.join('-');

    self._cache.get(memKey, function (err, res) {
        if (arguments.length < 2) {
            defer.reject(err);
        } else {
            defer.resolve(res);
        }
    });

    return defer.promise();
}

module.exports = init;