var express = require('express')

class LindyHop {
  constructor (app) {
    this.app = app
  }

  router (path) {
    return new Router(this, this.app, path)
  }

  pagination (type, runnable) {

  }

  auth (type, runnable) {

  }
}

class Router {
  constructor (lindy, app, path) {
    this.app = app
    this.router = express.Router()
    this.app.use(path, this.router)
    this.validator = new Validator(lindy)
  }

  get (path, desc) {
    return this._method('GET', path, desc)
  }

  post (path, desc) {
    return this._method('POST', path, desc)
  }

  put (path, desc) {
    return this._method('PUT', path, desc)
  }

  del (path, desc) {
    return this._method('DELETE', path, desc)
  }

  patch (path, desc) {
    return this._method('PATCH', path, desc)
  }

  _method (method, path, description) {
    this.method = method
    this.path = path
    this.description = description
    return this
  }

  auth (type, optional) {

  }

  paginate (type, fields) {

  }

  params (validator) {
    validator(this.validator)
    return this
  }

  run (runnable) {
    var method = this.method.toLowerCase()
    this.router[method](this.path, (req, res, next) => {
      var params = {}
      var values
      if (method === 'post') {
        values = req.body
      } else {
        values = req.query
      }
      var errors = []
      Promise.all(this.validator.rules.map((rule) => {
        var field = rule.field
        return Promise.resolve()
          .then(() => {
            var value = values[field]
            if (value == null) {
              if (!rule.isOptional) {
                return errors.push({ field, message: `${field} is mandatory` })
              } else if (rule.defaultValue) {
                value = rule.defaultValue
              } else {
                return
              }
            } else {
              return Promise.resolve()
                .then(() => rule.validate(value))
                .catch((err) => errors.push(err))
            }
          })
          .then((value) => {
            if (!value) return
            if (rule.asValue) field = rule.asValue
            params[field] = value
          })
      }))
      .then(() => {
        if (errors.length > 1) {
          return exports.rejects.request({ errors })
        } else if (errors.length === 1) {
          return errors[0]
        }
        return runnable(params)
      })
      .then((data) => res.json(data))
      .catch((err) => {
        var statusCode = err[typeSymbol] || 500
        console.log('err', err)
        if (err instanceof Error) {
          console.error(err.stack)
          err = {
            error: 'InternalError',
            message: err.message
          }
        }
        res.status(statusCode).json(err)
      })
      .catch((err) => console.log('err', err))
    })
  }
}

class Validator {
  constructor (lindy) {
    this.rules = []
  }
}

class AbstractValidator {
  as (as) {
    this.asValue = as
    return this
  }

  optional () {
    this.isOptional = true
    return this
  }
}

class StringValidator extends AbstractValidator {
  nonEmpty () {
    this.isNonEmpty = true
    return this
  }

  trim () {
    this.mustTrim = true
    return this
  }

  lowerCase () {
    this.mustLowerCase = true
    return this
  }

  upperCase () {
    this.mustUpperCase = true
    return this
  }

  validate (value) {
    if (this.mustTrim) value = value.trim()
    if (this.isNonEmpty && value.length === 0) {
      return exports.rejects.request({ field: this.field, message: `${this.field} must not be empty. Received '${value}'` })
    }
    if (this.mustLowerCase) value = value.toLowerCase()
    if (this.mustUpperCase) value = value.toUpperCase()
    return value
  }
}

class NumberValidator extends AbstractValidator {
  min (value) {
    this.minValue = value
    return this
  }

  max (value) {
    this.maxValue = value
    return this
  }

  validate (value) {
    value = +value
    if (isNaN(value)) {
      return exports.rejects.request({ field: this.field, message: `${this.field} must be a number. Received '${value}'` })
    }
    if (this.minValue && value < this.minValue) {
      return exports.rejects.request({ field: this.field, message: `${this.field} must be a number. Received '${value}'` })
    }
    return value
  }
}

exports.hop = (app) => {
  return new LindyHop(app)
}

exports.AbstractValidator = AbstractValidator

exports.addValidator = (type, validator) => {
  Validator.prototype[type] = function (field, description) {
    var rule = new (Function.prototype.bind.apply(validator))
    rule.field = field
    rule.description = description
    this.rules.push(rule)
    return rule
  }
}

exports.addValidator('string', StringValidator)
exports.addValidator('number', NumberValidator)

var typeSymbol = Symbol('type')
var types = {
  internal: 500,
  forbidden: 403,
  request: 400,
  notFound: 404
}
exports.rejects = {}
Object.keys(types).forEach((type) => {
  exports.rejects[type] = function (value, message) {
    if (typeof value === 'string') {
      value = { error: value, message }
    }
    value[typeSymbol] = types[type]
    return Promise.reject(value)
  }
})
