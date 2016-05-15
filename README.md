# lindyhop

Express router with doc generation, validation and improved middleware support. See an example:

```javascript
var express = require('express')
var lindyhop = require('lindyhop')

var app = express()
var lindy = lindyhop.hop(app)

var users = lindy.router('/users')

users.get('/foo', 'This is what this endpoint does')
  .middleware('auth', { rol: 'admin' })
  .middleware('pagination')
  .params((validate) => {
    validate
      .string('type', 'The type of foo you want to get')
      .optional()
      .trim()
      .lowerCase()
    validate
      .number('bar')
      .min(0)
      .max(100)
    validate
      .object('userId', 'The id of the user for something')
      .model(Users)
      .as('user')
  })
  .run((params) => {
    // your business logic that returns data or a promise
  })
```

This library will also support other stuff like: middlewares, pagination and authentication

## Routers

A router is a group of endpoints. You just need to specify the path in which these endpoints will be mounted. For example

```javascript
var users = lindy.router('/users')
```

## Routes

You can create routes from an existing router using the `.get()`, `.post()`, `.put()`, `.delete()` and `.patch()` methods. All these methods require two arguments. First the path of the route and then the description of the route for documentation purposes.

Routes have a `.params()` method where you validate the request parameters and a `.run()` method where you put your business logic and which receives the validated parameters.

```javascript
users.get('/foo', 'This is what this endpoint does')
  .params((validate) => {
    validate
      .string('type', 'The type of foo you want to get')
      .optional()
      .trim()
      .lowerCase()
    validate
      .number('bar')
      .min(0)
      .max(100)
    validate
      .entity('userId', 'The id of the user for something')
      .model(Users)
      .as('user')
  })
  .run((params) => {
    // your business logic that returns data or a promise
  })
```

The returned data from the `.run()` method is automatically serialized to JSON.

## Validations

Validations are described in the `.params()` method. An object is passed to the callback function of this method that allows you to describe validations. The structure is `validate.[type](fieldName, description).specificMethod()`.

There are two built-in validators: `string` and `number` with the following methods:

### String validations

- `.notEmpty()` will return an error if the value is an empty string
- `.trim()` will trim the value
- `.lowerCase()` will lowercase the value
- `.upperCase()` will uppercase the value

### Number validations

- `.min(minValue)` will return an error if the value passed is lower than that minimum value
- `.max(maxValue)` will return an error if the value passed is higher than that maximum value

Additionally any validator has a `.as()` and `.optional()` method. With `.as()` you can rename the parameter and with `.optional()` you will make it optional, so no error will be returned if the parameter is not in the request.

## Custom validators

You can also create your custom validators. For example, let's see how to create a custom validation that reads objects by id using an ORM.

```javascript
class EntityValidator extends lindyhop.AbstractValidator {
  // custom method
  model (clazz) {
    this.clazz = clazz
    return this
  }

  // mandatory method
  validate (value) {
    return this.clazz.findById(value)
      .then((obj) => {
        if (!obj && !this.isOptional) {
          return this.validationError(`User with id '${value}' not found`)
        }
        return obj
      })
  }
}

// register the validator
lindyhop.validator('entity', EntityValidator)
```

Then you can use it like this:

```javascript
events.post('/invite', 'This is what this endpoint does')
  .params((validate) => {
    validate
      .entity('userId', 'The user to be invited')
      .model(Users) // calling our custom method
      .as('user')
    validate
      .entity('event', 'The event to which the user is invited')
      .model(Events) // calling our custom method
      .as('event')
  })
  .run((params) => {
    // params.user will contain the object from the database
  })
```

All validations are executed in parallel, so in our case the `user` and the `event` are read from the database in parallel.

## Middleware

You can add your own middleware like this:

```javascript
lindyhop.middleware('pagination', (req, res, options, params) => {
  params.offset = +req.query.offset || 0
  params.limit = 100
})
```

You need to specify the name of the middleware and then a function with the following parameters:

- `req`: the request
- `res`: the response
- `options`: we will see this later
- `params`: the params object that will be passed to the `run()` method of the controller

Then you can use it this way:

```javascript
users.get('/foo', 'This is what this endpoint does')
  .middleware('pagination')
  .run((params) => {
    // here you have params.limit and params.offset
  })
```

You can optionally pass an options object to `middleware()` like this: `.middleware('pagination', someOptions)`. That object will be passed to the middleware function as third parameter.

## Error responses

You can create meaningful errors with the `rejects` utility. For example:

```javascript
var rejects = lindyhop.rejects

users.get('/foo', 'This is what this endpoint does')
  .run((params) => {
    if (something) {
      return rejects.forbidden('The reason of the bad request')
    }
  })
```

The available error types are:

- `rejects.internalError()`: will return a 500 status code
- `rejects.forbidden()`: will return a 403 status code
- `rejects.badRequest()`: will return a 400 status code
- `rejects.notFound()`: will return a 404 status code

All these methods can be used with one or two arguments.

With one string, such as `rejects.internalError('Your message')` it will return

```json
{
  "error": "InternalError",
  "message": "Your messsage"
}
```

Passing two strings, such as `rejects.internalError('DatabaseError', 'Your message')` will return a response like this:

```json
{
  "error": "DatabaseError",
  "message": "Your messsage"
}
```

If the controller throws an `Error`, it will return a response like this:

```json
{
  "error": "InternalError",
  "message": "Error message"
}
```

And the error will be printed to the `stderr` with `console.error()`.

If the controller returns a regular promise rejected, created with a string like `Promise.reject('Your message')` it will return a response like this:

```json
{
  "error": "InternalError",
  "message": "Your messsage"
}
```

But if the rejection reason is not a string, like `Promise.reject({ fail: 'reason' })`, the rejection object will be serialized directly:

```json
{
  "fail": "reason"
}
```

Validation errors contain an array of `errors`, each one containing a `field` with the name of the field that filed validation and a `message` describing the reason:

```json
{
  "error": "ValidationError",
  "message": "Bad request. Check the errors",
  "errors": [
    {
      "field": "bar",
      "message": "'bar' must be a number. Received 'not-a-number'"
    },
    {
      "field": "userId",
      "message": "User with id '123' not found"
    }
  ]
}
```

## Documentation

Work in progress
