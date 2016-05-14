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
    this.lindy = lindy
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
    return new Route(this.lindy, this.router, method, path, description)
  }

}

class Route {
  constructor (lindy, router, method, path, description) {
    this.router = router
    this.method = method
    this.path = path
    this.description = description
    this.validator = new Validator(lindy)
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
                return errors.push({ field, message: `'${field}' is mandatory`, error: 'ValidationError' })
              } else if (rule.defaultValue) {
                return rule.defaultValue
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
          return exports.rejects.badRequest({ errors })
        } else if (errors.length === 1) {
          return exports.rejects.badRequest(errors[0])
        }
        return runnable(params)
      })
      .then((data) => res.json(data))
      .catch((err) => {
        var statusCode = err[typeSymbol] || 500
        if (err instanceof Error) {
          console.error(err.stack)
          err = {
            error: 'InternalError',
            message: err.message
          }
        }
        res.status(statusCode).json(err)
      })
    })
  }
}

class Validator {
  constructor (lindy) {
    this.rules = []
  }
}

class AbstractValidator {
  default (def) {
    this.defaultValue = def
    return this
  }

  as (as) {
    this.asValue = as
    return this
  }

  optional () {
    this.isOptional = true
    return this
  }

  validationError (message) {
    return exports.rejects.badRequest({
      error: 'ValidationError',
      field: this.field,
      message
    })
  }
}

class StringValidator extends AbstractValidator {
  notEmpty () {
    this.isNotEmpty = true
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
    if (this.isNotEmpty && value.length === 0) {
      return this.validationError(`'${this.field}' must not be empty. Received '${value}'`)
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
    var num = +value
    if (isNaN(num)) {
      return this.validationError(`'${this.field}' must be a number. Received '${value}'`)
    }
    if (this.minValue != null && num < this.minValue) {
      return this.validationError(`'${this.field}' must be greater or equal to ${this.minValue}. Received '${value}'`)
    }
    if (this.maxValue != null && num > this.maxValue) {
      return this.validationError(`'${this.field}' must be lower or equal to ${this.maxValue}. Received '${value}'`)
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
  badRequest: 400,
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
