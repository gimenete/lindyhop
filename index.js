var express = require('express')
var pync = require('pync')

class Redirect {
  constructor (url, permanent) {
    this.url = url
    this.permanent = permanent
  }
}

exports.redirect = (url, permanent) => {
  return new Redirect(url, permanent)
}

var middlewares = {}
exports.middleware = (type, runnable) => {
  middlewares[type] = runnable
}

var outputs = {}
var mimes = {}
exports.output = (type, mime, runnable) => {
  outputs[type] = runnable
  mimes[type] = mime
}

exports.output('json', 'application/json', (req, res, data, options) => {
  res.json(data)
})

exports.output('html', 'text/html', (req, res, data, options) => {
  if (res.statusCode >= 400) {
    options = String(res.statusCode)
  }
  res.render(options, data)
})

class LindyHop {
  constructor (app, info) {
    this.app = app
    this.info = info
    this.middlewares = {}
    this.routers = []
  }

  router (path) {
    var router = new Router(this, this.app, path)
    this.routers.push(router)
    return router
  }

  docs () {
    var docs = {
      swagger: '2.0',
      info: Object.assign({}, this.info),
      paths: {}
    }
    this.routers.forEach((router) => router.docs(docs))
    return docs
  }
}

class Router {
  constructor (lindy, app, path) {
    this.lindy = lindy
    this.app = app
    this.path = path
    this.router = express.Router()
    this.app.use(path, this.router)
    this.routes = []
  }

  get (path, desc) {
    return this._method('get', path, desc)
  }

  post (path, desc) {
    return this._method('post', path, desc)
  }

  put (path, desc) {
    return this._method('put', path, desc)
  }

  delete (path, desc) {
    return this._method('delete', path, desc)
  }

  patch (path, desc) {
    return this._method('patch', path, desc)
  }

  _method (method, path, description) {
    var route = new Route(this.lindy, this.router, method, path, description)
    this.routes.push(route)
    return route
  }

  docs (docs) {
    this.routes.forEach((route) => route.docs(docs, this.path))
  }
}

class Route {
  constructor (lindy, router, method, path, description) {
    this.router = router
    this.method = method
    this.path = path
    this.description = description
    this.validator = new Validator(lindy)
    this._middlewares = []
    this.output = 'json'
  }

  middleware (type, options) {
    this._middlewares.push({ type, options })
    return this
  }

  middlewares (...types) {
    types.forEach((type) => this._middlewares.push({ type }))
    return this
  }

  params (validator) {
    validator(this.validator)
    return this
  }

  outputs (output, options) {
    this.output = output
    this.outputOptions = options
    return this
  }

  run (runnable) {
    var method = this.method
    this.router[method](this.path, (req, res, next) => {
      var params = {}
      var errors = []
      pync.series(this._middlewares, (middleware) => {
        var { type, options } = middleware
        var func = middlewares[type]
        if (!func) return exports.rejects.internalError(`Middleware not found '${type}'`)
        return Promise.resolve().then(() => func(req, res, options, params))
      })
      .then(() => {
        return Promise.all(this.validator.rules.map((rule) => {
          var field = rule.field
          return Promise.resolve()
            .then(() => {
              var values = method === 'get' || method === 'delete' ? req.query : req.body
              if (rule.inValue) {
                if (rule.inValue === 'query') values = req.query
                else if (rule.inValue === 'header') values = req.headers
                else if (rule.inValue === 'path') values = req.params
              }
              var value = values[field]
              if (value == null) {
                if (!rule.isOptional) {
                  return errors.push({ field, message: `'${field}' is mandatory` })
                } else if (rule.defaultValue) {
                  return rule.defaultValue
                } else {
                  return
                }
              } else {
                return Promise.resolve()
                  .then(() => {
                    if (!rule.isArray) {
                      return rule.validate(value)
                    } else {
                      if (!Array.isArray(value)) value = [value]
                      return Promise.all(value.map((val) => rule.validate(val)))
                    }
                  })
                  .catch((err) => errors.push(err))
              }
            })
            .then((value) => {
              if (!value) return
              if (rule.asValue) field = rule.asValue
              params[field] = value
            })
        }))
      })
      .then(() => {
        if (errors.length > 0) {
          return exports.rejects.badRequest({
            error: 'ValidationError',
            message: 'Bad request. Check the errors',
            errors
          })
        }
        return runnable(params)
      })
      .then((data) => {
        if (data instanceof Redirect) {
          return res.redirect(data.permanent ? 301 : 302, data.url)
        }
        var runner = outputs[this.output]
        if (!runner) return exports.rejects.internalError(`Output serializer not found '${this.output}'`)
        runner(req, res, data, this.outputOptions)
      })
      .catch((err) => {
        var statusCode = err[typeSymbol] || 500
        if (err instanceof Error) {
          console.error(err.stack)
          err = {
            error: 'InternalError',
            message: err.message
          }
        }
        res.status(statusCode)
        var runner = outputs[this.output]
        if (!runner) return res.json(err)
        runner(req, res, err, { err })
      })
    })
  }

  docs (docs, basePath) {
    var route = {
      summary: this.description,
      produces: [mimes[this.output]],
      responses: {
        '200': {}
      }
    }

    var defInValue = this.method === 'get' || this.method === 'delete' ? 'query' : 'formData'
    route.parameters = this.validator.rules.map((rule) => {
      return {
        name: rule.field,
        type: rule.type,
        in: rule.inValue || defInValue,
        required: !rule.isOptional,
        description: rule.description
      }
      // TODO: maximum, minimum
    })

    var fullPath = basePath + this.path
    var path = docs.paths[fullPath]
    if (!path) {
      path = docs.paths[fullPath] = {}
    }
    path[this.method] = route
    route.operationId = fullPath.replace(/\//g)
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

  array () {
    this.isArray = true
    return this
  }

  validationError (message) {
    return exports.rejects.badRequest({
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

  in (inValue) {
    const values = ['query', 'header', 'path', 'formData']
    if (values.indexOf(inValue) === -1) {
      throw new Error(`Invalid 'in' value '${inValue}'. Accepted values: ${values}`)
    }
    this.inValue = inValue
    return this
  }

  validate (value) {
    if (typeof value !== 'string') {
      return this.validationError(`'${this.field}' must be a string. Received '${value}'`)
    }
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

exports.hop = (app, info) => {
  return new LindyHop(app, info)
}

exports.AbstractValidator = AbstractValidator

exports.validator = (type, validator) => {
  Validator.prototype[type] = function (field, description) {
    var rule = new (Function.prototype.bind.apply(validator))
    rule.type = type
    rule.field = field
    rule.description = description
    this.rules.push(rule)
    return rule
  }
}

exports.validator('string', StringValidator)
exports.validator('number', NumberValidator)

var typeSymbol = Symbol('type')
var types = {
  internalError: 500,
  forbidden: 403,
  badRequest: 400,
  notFound: 404
}
exports.rejects = {}
Object.keys(types).forEach((type) => {
  exports.rejects[type] = function (value, message) {
    if (typeof value === 'string') {
      if (message) {
        value = { error: value, message }
      } else {
        value = {
          error: type.substring(0, 1).toUpperCase() + type.substring(1),
          message: value
        }
      }
    }
    value[typeSymbol] = types[type]
    return Promise.reject(value)
  }
})
