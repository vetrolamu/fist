fist.app [![Build Status](https://travis-ci.org/fistlabs/fist.app.png?branch=v0.3.x)](https://travis-ci.org/fistlabs/fist.app)
=========

[English version](README.en.md)

```js
var fist = new Fist();
```

Fist — это супер-навороченный, но лёгкий серверный фреймворк для платформы [node.js](http://nodejs.org/). Главными особенностями Fist являются чистая плагинизация, не порождающая сайд-эффекты, быстрая и удобно организованная маршрутизация запросов, простота и гибкость использования. Fist предоставляет мощное API для обработки http-запросов, спроектированное с фокусом на удобство расширения.

Главным в каждом fist-приложении является набор ```узлов (knot)```. Узлом приложения называется сущность, которая выполняет некоторое действие (например, сбор данных или шаблонизацию) по завершении которого она отдаёт следующему узлу результат или ошибку, или отправляет данные на клиент. Узлы приложения могут зависеть друг от друга и пользоваться асинхронно полученными результатами выполнения зависимостей.

Одним из этапов инициализации fist-приложения является декларирование узлов, с помощью метода ```decl(path[, deps], data)```

```js
fist.decl('users', function (track, result, done, errors) {
    done(null, ['golyshevd', 'seiies']);
});
```

В сниппете выше приведен пример узла, который разрешается возвратом списка пользователей. Первый аргумент функции ```fist.decl``` — назавние узла. Второй аргумент — тело узла. В функцию, являющуюся телом узла, передается несколько аргументов.

```track``` это объект, являющийся экземпляром [fist.app/Runtime](Runtime.js), который предоставляет API для обработки запросов. С его помощью можно установить заголовки ответа, прочитать заголовки запроса, отправить данные на клиент и многое другое.

```result``` - это объект, содержащий результаты зависимостей узла, разрешенных с положительным результатом, без ошибки.

```done``` - это функция, которая «разрешает» узел, завершая его выполнение и передавая управление программой узлам, зависящим от него. ```done``` может быть вызвана асинхронно, в любой момент. Все зависящие от ```users``` узлы будут ожидать, пока он будет разрешен. Первый аргумент функции ```done``` — это объект ошибки, второй — результат. Чтобы разрешить узел с ошибкой, можно вызвать ```done``` с одним аргументом.

```errors``` - тоже является объектом, но в отличие от ```result``` содержит результаты зависимостей узла, разрешенных с ошибкой.

На первый взгляд,  порядок аргументов может показаться странным, но он был тщательно продуман. ;) ```track``` – жизненно важный объект почти для каждого узла, поэтому он первый. Объект ```result``` необходим любому мало-мальски сложному узлу, у которого есть зависимости. ```done``` как правило, вызывается когда результаты зависимостей были обработаны. Почему ```errors``` последний? В первую очередь, потому что он необязательный, и не всегда используется.
Факт разрешения узла с ошибкой, как правило, является неудовлетворительным, и бывает достаточно определить это по отсутствию результата в ```result```. Объект ```errors``` предоставляет возможность обрабатываеть ошибки избирательно.
Например, в зависимоти от того, какой ошибкой разрешится объект ```users```, зависимый от него узел может вести себя тем или иным образом.

```js
fist.decl('index', ['users'], function (track, result) {

  var users = result.users.map(function (name) {
      return '<li>' + name + '</li>';
  }).join('');
  
  track.header('Content-Type', 'text/html');
  track.send(200, '<ul>' + users + '</ul>');
});

```

Рассмотрим узел ```index```. Он зависит от ```users```. В данном случае узел явно полагается на положительный результат выполнения своей зависимости, но если есть вероятность, что она может быть разрешена с ошибкой, то рекомендуется это проверить. Как мы видим, в объекте ```result``` под ключом ```users``` находится результат выполнения зависимости. Именно под тем ключом под которым она была продекларирована. Но у имен узлов есть важная особенность. Если имя узла будет содержать точки, например ```users.ids```, то это будет интерпретировано как json-path, и результат узла будет вложен в ```result``` или ```errors``` по соответствующему пути.

Обратите внимание, что узел ```index``` не вызывает ```done```, но он вызывает ```track.send```, который отправляет данные на клиент. Таким образом, любой узел может напрямую вызвать ```view```. В таком случае резолвинг не требуется и после отправки данных невозможен совсем.

Абсолютно любой узел может быть ассоциирован с реальным http-запросом. Для этого в Fist реализован роутинг.

```js
fist.route('GET', '/', 'index');
```

Это значит что на GET / будет запущено выполнения узла ```index```.

```js
fist.route('GET', '/raw-users/', 'users');
```

Что произойдет в данном случае? Если в дереве зависимостей узлов, ни один из них не вызовет ```track.send```, то это произойдет автоматически, по простому приципу, если целевой узел был разрешен с результатом, то результат будет отправлен с кодом 200, а если с ошибкой, то с кодом 500.

Когда все узлы продекларированы, и с необходимыми узлами ассоциированы маршруты, можно запустить http-сервер

```js
fist.listen(1337);
```






Fist way
---------

Для удобной организации кода приложения имеет смысл создать как минимум 2 директории для датапровайдеров, в одной будут храниться "чистые" датапровайдеры, которые не будут писать во ```view```, в другой те, в которых непостредственно происходит шаблонизация данных и отправка на клиент. В случае выше чистым датапровайдером является ```users```, а ```index``` - производит шаблонизацию данных и отправку изх на клиент.
Пусть эти директории будут названы ```data``` и ```view``` например. Формат у этих датапровайдеров абсолютно одинаковый, но имеет смысл не смешивать их в одной директории просто по эстетическим соображениям.
Каждый файл в директории будет являться декларацией датапровайдера. Декларация имеет простейший интерфейс, который нужно имплементировать. Это массив строк deps (или просто строка если одна зависимость) и data - любое значение, если будет функция, то будет вызвана. Пример датапровайдера ```users``` из примера выше:

```js
//  users.js
//  Это можно совсем не писать если нет зависимостей
exports.deps = [];
exports.data = function (track, result, done) {
    // это резолвинг датапровайдера с положительным результатом
    //  done('ERR') - реджект
    done(null, ['pete', 'abraham']);
};
```

В данном примере датапровайдер возвращает всегда статический результат, можно было бы просто написать
```js
exports.data = ['pete', 'abraham'];
```

У датапровайдеров есть несколько фишек и особенностей. Во первых имена файлов. Имя файла является ключом под которым результат резолвинга будет помещен в ```result``` или в ```errors``` соответственно. Но есть одно "но".
Это имя всегда приводится к camelCase по таким правилам:

 * users -> users
 * Users -> users
 * USERS -> users
 * ABBRUsers -> abbrUsers

И указывая зависимости необходимо это учитывать.

Еще одной особенностью являются точки в именах файлов. Расширение .js всегда отсекается, но другое отсечаено не будет и имена вроде ```users.names.js``` будут интерпретированы как path и результатом будет объект с ссответствующей вложенностью.

И наконец еще одной особенностью явзяется то, что если файл датапровайдера экспортирует функцию, то она юужет воспринята как конструктор и проинстанцирована с объектом параметров который был передан в ```new Fist(params)```

При инстанцировании Fist надо указать параметр action который является строкой или массивом строк-директорий кде у вас лежат датапровайдеры.
```js
var fist = new Fist({
    action: [
        Path.resolve('data'),
        Path.resolve('view');
    ]
})
```

Fist не занимается резолвингом путей до директорий, поэжтому необхъодимо об этом позаботиться самостоятельно, если не хотите чтобы в разных окружениях были приблемы с путями, например если http-сокет будет лежать в другой директории при деплое в продакшн.

Если передать параметр action, то директории считаются и провайдеры автоматически продекларируются. Останется только разобраться с маршрутами.

Каждый маршрут это метод запроса, pattern в терминах fist.router и имя датапровайдера к которому будет привязан этот маршрут.

Чтобы руками не декларировать каждый из маршрутов, напишите такой конфиг router.json:

```json
[
    {
        "name": "index",
        "expr": "/",
        "verb": "GET"
    }
]
```

и передайте его в конструктор Fist:

```js
var fist = new Fist({
    action: [],
    routes: require('router.json')
});

fist.listen(1337);
```
