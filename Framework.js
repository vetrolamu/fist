'use strict';

var Http = require('http');
var Nested = /** @type Nested */ require('./bundle/Nested');
var Server = /** @type Server */ require('./Server');

var caller = require('./util/caller');

/**
 * @class Framework
 * @extends Server
 * */
var Framework = Server.extend(/** @lends Framework.prototype */ {

    /**
     * @protected
     * @memberOf {Framework}
     * @method
     *
     * @constructs
     * */
    constructor: function () {
        Framework.Parent.apply(this, arguments);

        /**
         * Тут откладываются запросы поступившие во время инициализации
         *
         * @protected
         * @memberOf {Framework}
         * @property
         * @type {Array<Track>}
         * */
        this._pends = [];

        /**
         * Количество запущенных инициализаций
         *
         * @protected
         * @memberOf {Framework}
         * @property
         * @type {Number}
         * */
        this._pending = 0;

        /**
         * Состояние приложения
         *
         * @protected
         * @memberOf {Framework}
         * @property
         * @type {Number}
         * */
        this._state = -1;

        /**
         * Плагины, задачи на инициализацию
         *
         * @protected
         * @memberOf {Framework}
         * @property
         * @type {Array<Function>}
         * */
        this._tasks = [];

        /**
         * Шаблоны для track.render()
         *
         * @public
         * @memberOf {Framework}
         * @property {Object<Function>}
         * */
        this.renderers = Object.create(null);
    },

    /**
     * Запускает сервер и инициализацию приложения
     *
     * @public
     * @memberOf {Framework}
     * @method
     * */
    listen: function () {

        var server = Http.createServer(this.getHandler());

        server.listen.apply(server, arguments);
        //  автоматически запускаю инициализацию
        this.ready();

        return server;
    },

    /**
     * Запускает инициализацию приложения
     *
     * @public
     * @memberOf {Framework}
     * @method
     * */
    ready: function () {

        var length = this._tasks.length;
        var self = this;

        //  приложение в состоянии ошибки
        if ( 1 === this._state ) {

            return;
        }

        //  увеличиваю количество запросов на инициализацию
        this._pending += 1;

        if ( 1 === this._pending ) {
            this.emit('sys:pending');
        }

        //  нет задач
        if ( 0 === length ) {
            this._pending -= 1;

            if ( 0 === this._pending ) {
                this._state = 0;
                this.emit('sys:ready');
                // TODO RESEARCH: могут ли тут быть отложенные запросы?
            }

            return;
        }

        function ready (err) {

            //  разрешение плагина не требуется,
            // потому что уже произошла ошибка
            if ( 1 === self._state ) {

                return;
            }

            //  плагин разрешен с ошибкой
            if ( 1 === arguments.length ) {
                //  Если произошла критическая ошибка то вы можете
                // поджечь сами sys:ready если можете ее разрешить
                self.once('sys:ready', function () {
                    self._pending -= 1;
                    self._state = 0;
                    ready();
                });

                self._state = 1;
                self.emit('sys:error', err);

                return;
            }

            //  уменьшаем количество разрешенных задач
            length -= 1;

            //  все задачи разрешены
            if ( 0 === length ) {
                //  уменьшаем количество запросов на инициализацию
                self._pending -= 1;

                //  все запросы на инициализацию завершены
                if ( 0 === self._pending ) {
                    self._state = 0;
                    self.emit('sys:ready');

                    while ( self._pends.length ) {
                        self._handle(self._pends.shift());
                    }
                }
            }
        }

        while ( this._tasks.length ) {

            if ( 1 === self._state ) {

                break;
            }

            caller.callFunc(this._tasks.shift().bind(this), [], ready);
        }
    },

    /**
     * Добавляет плагин
     *
     * @public
     * @memberOf {Framework}
     * @method
     * */
    plug: function () {
        Array.prototype.push.apply(this._tasks, arguments);
    },

    /**
     * @protected
     * @memberOf {Framework}
     * @method
     *
     * @param {Function} func
     * @param {Runtime} track
     * @param {Bundle} bundle
     * @param {Function} done
     * */
    _call: function (func, track, bundle, done) {

        if ( 'function' === typeof func ) {
            caller.callFunc.call(this, func,
                [track, bundle.errors, bundle.result], done);

            return;
        }

        caller.callRet.call(this, func, done, true);
    },

    /**
     * @protected
     * @memberOf {Framework}
     * @method
     *
     * @returns {Nested}
     * */
    _createBundle: function () {

        return new Nested();
    },

    /**
     * @protected
     * @memberOf {Framework}
     * @method
     *
     * @param {Runtime} track
     * */
    _handle: function (track) {

        if ( 1 === this._state ) {

            return;
        }

        if ( 0 === this._state && 0 === this._pending ) {
            Framework.parent._handle.apply(this, arguments);

            return;
        }

        this._pends.push(track);
    }

});

module.exports = Framework;
