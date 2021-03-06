/**
 * Passbook are created from templates
 */

'use strict';

const { URL } = require('url');
const { stat, readFile } = require('fs');
const { promisify } = require('util');
const { join } = require('path');

const PassImages = require('./lib/images');
const Pass = require('./pass');
const { PASS_STYLES } = require('./constants');

const readFileAsync = promisify(readFile);
const statAsync = promisify(stat);

// Create a new template.
//
// style  - Pass style (coupon, eventTicket, etc)
// fields - Pass fields (passTypeIdentifier, teamIdentifier, etc)
class Template {
  constructor(style, fields = {}) {
    if (!PASS_STYLES.includes(style))
      throw new Error(`Unsupported pass style ${style}`);

    this.style = style;
    this.fields = {};
    // we will set all fields via class setters, as in the future we will implement strict validators
    // values validation: https://developer.apple.com/library/content/documentation/UserExperience/Reference/PassKit_Bundle/Chapters/TopLevel.html
    Object.entries(fields).forEach(([field, value]) => {
      if (typeof this[field] === 'function') this[field](value);
    });

    this.keysPath = 'keys';
    this.images = new PassImages();
  }

  /**
   * Validates if given string is a correct color value for Pass fields
   * 
   * @static
   * @param {string} value 
   * @throws - if value is invalid this function will throw
   * @memberof Template
   */
  static validateColorValue(value) {
    // it must throw on invalid value
    // valid values are like rgb(123, 2, 22)
    /^rgb\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\s*\)$/
      .exec(value)
      .slice(1)
      .map(v => parseInt(v, 10))
      .some(v => {
        if (isNaN(v) || v < 0 || v > 255)
          throw new Error(`Invalid color value ${value}`);
        return false;
      });
  }

  passTypeIdentifier(v) {
    if (arguments.length === 1) {
      this.fields.passTypeIdentifier = v;
      return this;
    }
    return this.fields.passTypeIdentifier;
  }

  teamIdentifier(v) {
    if (arguments.length === 1) {
      this.fields.teamIdentifier = v;
      return this;
    }
    return this.fields.teamIdentifier;
  }

  backgroundColor(v) {
    if (arguments.length === 1) {
      this.fields.backgroundColor = v;
      return this;
    }
    return this.fields.backgroundColor;
  }

  foregroundColor(v) {
    if (arguments.length === 1) {
      Template.validateColorValue(v);
      this.fields.foregroundColor = v;
      return this;
    }
    return this.fields.foregroundColor;
  }

  labelColor(v) {
    if (arguments.length === 1) {
      Template.validateColorValue(v);
      this.fields.labelColor = v;
      return this;
    }
    return this.fields.labelColor;
  }

  logoText(v) {
    if (arguments.length === 1) {
      this.fields.logoText = v;
      return this;
    }
    return this.fields.logoText;
  }

  organizationName(v) {
    if (arguments.length === 1) {
      this.fields.organizationName = v;
      return this;
    }
    return this.fields.organizationName;
  }

  groupingIdentifier(v) {
    if (arguments.length === 1) {
      this.fields.groupingIdentifier = v;
      return this;
    }
    return this.fields.groupingIdentifier;
  }

  /**
   * sets or gets suppressStripShine
   * 
   * @param {boolean?} v 
   * @returns {Template | boolean}
   * @memberof Template
   */
  suppressStripShine(v) {
    if (arguments.length === 1) {
      if (typeof v !== 'boolean')
        throw new Error('suppressStripShine value must be a boolean!');
      this.fields.suppressStripShine = v;
      return this;
    }
    return this.fields.suppressStripShine;
  }

  /**
   * gets or sets webServiceURL
   * 
   * @param {URL | string} v 
   * @returns {Template | string}
   * @memberof Template
   */
  webServiceURL(v) {
    if (arguments.length === 1) {
      // validating URL, it will throw on bad value
      const url = v instanceof URL ? v : new URL(v);
      if (url.protocol !== 'https:')
        throw new Error(`webServiceURL must be on HTTPS!`);
      this.fields.webServiceURL = url.toString();
      return this;
    }
    return this.fields.webServiceURL;
  }

  /**
   * Sets path to directory containing keys and password for accessing keys.
   * 
   * @param {string} path - Path to directory containing key files (default is 'keys')
   * @param {string} password - Password to use with keys
   * @memberof Template
   */
  keys(path, password) {
    if (path) this.keysPath = path;
    if (password) this.password = password;
  }

  /**
   * Create a new pass from a template.
   * 
   * @param {Object} fields 
   * @returns {Pass}
   * @memberof Template
   */
  createPass(fields = {}) {
    // Combine template and pass fields
    return new Pass(this, Object.assign({}, this.fields, fields), this.images);
  }

  /**
   * Loads Template, images and key from a given path
   * 
   * @static
   * @param {string} folderPath 
   * @param {string} keyPassword - optional key password
   * @returns {Template}
   * @throws - if given folder doesn't contain pass.json or it is's in invalid format
   * @memberof Template
   */
  static async load(folderPath, keyPassword) {
    // Check if the path is accessible directory actually
    const stats = await statAsync(folderPath);
    if (!stats.isDirectory())
      throw new Error(`Path ${folderPath} must be a directory!`);

    // getting main JSON file
    const passJson = JSON.parse(
      await readFileAsync(join(folderPath, 'pass.json')),
    );

    // Trying to detect the type of pass
    let type;
    if (
      !PASS_STYLES.some(t => {
        if (t in passJson) {
          type = t;
          return true;
        }
        return false;
      })
    )
      throw new Error('Unknown pass style!');

    const template = new Template(type, passJson);

    // load images from the same folder
    await template.images.loadFromDirectory(folderPath);

    // checking if there is a key - must be named ${passTypeIdentifier}.pem
    const typeIdentifier = passJson.passTypeIdentifier;
    const keyName = `${typeIdentifier.replace(/^pass\./, '')}.pem`;
    try {
      const keyStat = await statAsync(keyName);
      if (keyStat.isFile()) template.keys(folderPath, keyPassword);
    } catch (_) {} // eslint-disable

    // done
    return template;
  }
}

module.exports = Template;
