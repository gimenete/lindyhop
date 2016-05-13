# lindyhop

Express router with doc generation, validation, promises support and boilerplate stuff solved.

This is work in progress. The idea is to be able to do something like this:

```javascript
var express = require('express')
var lindyhop = require('lindyhop')

var app = express()
var lindy = lindyhop.hop(app)

var users = lindy.router('/users')

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
      .object('userId', 'The id of the user for something')
      .model(Users)
      .as('user')
  })
  .run((params) => {
    // your business logic that returns a promise
  })
```

This library will also support other stuff like: middlewares, pagination and authentication
