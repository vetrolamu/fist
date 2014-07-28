'use strict';

var S_SEPARATOR = '\u0000';
var EventEmitter = /** @type EventEmitter */ require('events').EventEmitter;
var Skip = /** @type Skip */ require('./skip/skip');

var _ = require('lodash-node');
var inherit = require('inherit');
var vow = require('vow');

/**
 * @class Unit
 * */
var Unit = inherit(/** @lends Unit.prototype */ {

    /**
     * @private
     * @memberOf {Unit}
     * @method
     *
     * @constructs
     * */
    __constructor: function (params) {
        var maxAge = +this._maxAge;

        if ( _.isNaN(maxAge) ) {
            maxAge = 0;
        }

        /**
         * @protected
         * @memberOf {Unit}
         * @property
         * @type {Number}
         * */
        this._maxAge = maxAge;

        /**
         * @public
         * @memberOf {Unit}
         * @property
         * @type {Object}
         * */
        this.params = _.extend({}, this.params, params);

        //  make proto-deps own and unique
        this.addDeps(this.deps);
    },

    /**
     * @public
     * @memberOf {Unit}
     * @property
     * @type {Array<String>}
     * */
    deps: [],

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
     * @method
     * */
    addDeps: function () {
        this.deps = _.union(this.deps, _.flatten(arguments));
    },

    /**
     * @public
     * @abstract
     * @memberOf {Unit}
     * @method
     *
     * @param {Deps} context
     *
     * @returns {*}
     * */
    data: /* istanbul ignore next */ function (context) {
        /*eslint no-unused-vars: 0*/
    },

    /**
     * @public
     * @memberOf {Unit}
     * @method
     * */
    delDeps: function () {
        var args = _.flatten(arguments);

        this.deps = _.reject(this.deps, function (path) {

            return _.contains(args, path);
        });
    },

    /**
     * @public
     * @memberOf {Unit}
     * @method
     *
     * @param {Deps} context
     *
     * @returns {*}
     * */
    getValue: function (context) {
        var key;

        if ( 0 >= this._maxAge ) {

            return this.__call(context);
        }

        key = this.__getCacheKey(context);

        return this.__callThroughCache(key, context).then(function (value) {
            var data = value.data;

            //  из кэша или резолвер
            if ( !value.fresh || data instanceof Skip ) {

                return data;
            }

            //  только что загружено
            delete value.fresh;

            this.__setCache(key, value, context).fail(context.notify, context);

            return data;
        }, this);
    },

    /**
     * @private
     * @memberOf {Unit}
     * @method
     *
     * @param {String} key
     * @param {*} value
     * @param {Deps} context
     *
     * @returns {*}
     * */
    __setCache: function (key, value, context) {
        var defer = vow.defer();

        //  если запрос выполнен успешно то сохраняем в кэш
        context.track.agent.cache.set(key, value, this._maxAge, function (err) {

            if ( err ) {
                defer.reject(err);

                return;
            }

            defer.resolve(err);
        });

        return defer.promise();
    },

    /**
     * @protected
     * @memberOf {Unit}
     * @method
     *
     * @param {Deps} context
     *
     * @returns {Array<String>}
     * */
    _getCacheKeyParts: function (context) {
        /*eslint no-unused-vars: 0*/
        return [];
    },

    /**
     * @private
     * @memberOf {Unit}
     * @method
     *
     * @param {Deps} context
     *
     * @returns {*}
     * */
    __call: function (context) {
        var self = this;

        if ( _.isFunction(self.data) ) {

            return vow.invoke(function () {

                return self._callMethod('data', context);
            });
        }

        return vow.resolve(self.data);
    },

    /**
     * @private
     * @memberOf {Unit}
     * @method
     *
     * @param {Deps} context
     *
     * @returns {vow.Promise}
     * */
    __callAndWrap: function (context) {

        return this.__call(context).then(function (data) {

            return {
                data: data,
                fresh: true
            };
        });
    },

    /**
     * @protected
     * @memberOf {Unit}
     * @method
     *
     * @param {String} name
     * @param {Deps} context
     *
     * @returns {*}
     *
     * @throws {*}
     * */
    _callMethod: function (name, context) {

        return this[name](context);
    },

    /**
     * @private
     * @memberOf {Unit}
     * @method
     *
     * @param {Deps} context
     *
     * @returns {String}
     * */
    __getCacheKey: function (context) {

        return this._callMethod('_getCacheKeyParts', context).join(S_SEPARATOR);
    },

    /**
     * @private
     * @memberOf {Unit}
     * @method
     *
     * @param {String} key
     * @param {Deps} context
     *
     * @returns {vow.Promise}
     * */
    __callThroughCache: function (key, context) {

        return this.__getCache(key, context).then(function (res) {

            if ( _.isObject(res) ) {
                context.trigger('ctx:cache', res.data);

                return res;
            }

            return this.__callAndWrap(context);

        }, function (err) {
            //  ошибка забора из кэша
            context.notify(err);

            return this.__callAndWrap(context);
        }, this);
    },

    /**
     * @private
     * @memberOf {Unit}
     * @method
     *
     * @param {String} cacheKey
     * @param {Deps} context
     *
     * @returns {vow.Promise}
     * */
    __getCache: function (cacheKey, context) {
        var defer = vow.defer();

        context.track.agent.cache.get(cacheKey, function (err, res) {

            if ( err ) {
                defer.reject(err);

                return;
            }

            defer.resolve(res);
        });

        return defer.promise();
    }

});

module.exports = Unit;
