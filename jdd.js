/******************************************************************************* 
 * 
 * Copyright 2015-2017 Zack Grossbart
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 ******************************************************************************/
'use strict';

/**
 * The jdd object handles all of the functions for the main page.  It finds the diffs and manages
 * the interactions of displaying them.
 */
/*global jdd:true */



/*
    wrapper function, that returns a list of differences between two input json objects 
*/

module.exports = function(before, after){
    var config1 = jdd.createConfig();
    var config2 = jdd.createConfig();
    jdd.formatAndDecorate(config1, before);
    jdd.formatAndDecorate(config2, after);
    jdd.setSourceData(before , after);
    jdd.diffVal(before, config1, after, config2);
    jdd.processDiffs()
    return jdd.diffs;
}

var jdd = {

    LEFT: 'left',
    RIGHT: 'right',

    EQUALITY: 'eq',
    TYPE: 'type',
    MISSING: 'missing',
    DELETED: 'deleted',
    ADDED : 'added',
    MODIFIED : 'modified',
    diffs: [],
    requestCount: 0,
    pre : null,
    post: null,
    /**
     * Find the differences between the two objects and recurse into their sub objects.
     */
    setSourceData : function(pre, post){
        jdd.pre = pre;
        jdd.post = post;
    },
    findDiffs: function(/*Object*/ config1, /*Object*/ data1, /*Object*/ config2, /*Object*/ data2) {
       config1.currentPath.push('/');
       config2.currentPath.push('/');

       var key;
       var val;
       if (data1.length < data2.length) {
           /*
            * This means the second data has more properties than the first.
            * We need to find the extra ones and create diffs for them.
            */
           for (key in data2) {
               if (data2.hasOwnProperty(key)) {
                   val = data1[key];
                   if (!data1.hasOwnProperty(key)) {
                       jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                       config2, jdd.generatePath(config2, '/' + key),
                                                       'The right side of this object has more items than the left side', jdd.MISSING));
                   }
               }
           }
       }

       /*
        * Now we're going to look for all the properties in object one and
        * compare them to object two
        */
       for (key in data1) {
           if (data1.hasOwnProperty(key)) {
               val = data1[key];

               config1.currentPath.push(key);
    
               if (!data2.hasOwnProperty(key)) {
                   /*
                    * This means that the first data has a property which
                    * isn't present in the second data
                    */
                   jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                   config2, jdd.generatePath(config2),
                                                   'deleted:' + key , jdd.DELETED));
                } else {
                    config2.currentPath.push(key);
                
                    jdd.diffVal(data1[key], config1, data2[key], config2);
                    config2.currentPath.pop();
                }
                config1.currentPath.pop();
           }
       }

       config1.currentPath.pop();
       config2.currentPath.pop();

       /*
        * Now we want to look at all the properties in object two that
        * weren't in object one and generate diffs for them.
        */
       for (key in data2) {
           if (data2.hasOwnProperty(key)) {
               val = data1[key];

               if (!data1.hasOwnProperty(key)) {
                   jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                   config2, jdd.generatePath(config2, key),
                                                   'Added ' + key, jdd.ADDED));
               }
           }
       }
    },

    /**
     * Generate the differences between two values.  This handles differences of object
     * types and actual values.
     */
    diffVal: function(val1, config1, val2, config2) {
        if (_.isArray(val1)) {
            jdd.diffArray(val1, config1, val2, config2);
        } else if (_.isObject(val1)) {
            if (_.isArray(val2) || _.isString(val2) || _.isNumber(val2) || _.isBoolean(val2)) {
                jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                config2, jdd.generatePath(config2),
                                                'Both types should be objects', jdd.MODIFIED));
            } else {
                jdd.findDiffs(config1, val1, config2, val2);
            }
        } else if (_.isString(val1)) {
            if (!_.isString(val2)) {
                jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                config2, jdd.generatePath(config2),
                                               'Both types should be strings', jdd.MODIFIED));
            } else if (val1 !== val2) {
                jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                config2, jdd.generatePath(config2),
                                               'Both sides should be equal strings', jdd.MODIFIED));
            }
        } else if (_.isNumber(val1)) {
            if (!_.isNumber(val2)) {
                jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                config2, jdd.generatePath(config2),
                                               'Both types should be numbers', jdd.MODIFIED));
            } else if (val1 !== val2) {
                jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                config2, jdd.generatePath(config2),
                                               'Both sides should be equal numbers', jdd.MODIFIED));
            }
        } else if (_.isBoolean(val1)) {
            jdd.diffBool(val1, config1, val2, config2);
        } 
    },

    /**
     * Arrays are more complex because we need to recurse into them and handle different length
     * issues so we handle them specially in this function.
     */
    diffArray: function(val1, config1, val2, config2) {
        if (!_.isArray(val2)) {
           jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                           config2, jdd.generatePath(config2),
                                           'Both types should be arrays', jdd.MODIFIED));
        }

        if (val1.length < val2.length) {
            /*
             * Then there were more elements on the right side and we need to 
             * generate those differences.
             */
            for (var i = val1.length; i < val2.length; i++) {
                jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                config2, jdd.generatePath(config2, '[' + i + ']'),
                                                'Added: ' + i , jdd.ADDED));
            }
        }
        _.each(val1, function(arrayVal, index) {
            if (val2.length <= index) {
                jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1, '[' + index + ']'),
                                                config2, jdd.generatePath(config2),
                                                'Deleted: ' + index, jdd.DELETED));
            } else {
                config1.currentPath.push('/[' + index + ']');                
                config2.currentPath.push('/[' + index + ']');
                
                if (_.isArray(val2)) {
                    /*
                     * If both sides are arrays then we want to diff them.
                     */
                    jdd.diffVal(val1[index], config1, val2[index], config2);
                } 
                config1.currentPath.pop();
                config2.currentPath.pop();
            }
        });
    },

    /**
     * We handle boolean values specially because we can show a nicer message for them.
     */
    diffBool: function(val1, config1, val2, config2) { 
        if (!_.isBoolean(val2)) {
            jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                            config2, jdd.generatePath(config2),
                                            'Both types should be booleans', jdd.MODIFIED));
        } else if (val1 !== val2) {
            if (val1) {
                jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                config2, jdd.generatePath(config2),
                                                'The left side is <code>true</code> and the right side is <code>false</code>', jdd.MODIFIED));
            } else {
                jdd.diffs.push(jdd.generateDiff(config1, jdd.generatePath(config1),
                                                config2, jdd.generatePath(config2),
                                                'The left side is <code>false</code> and the right side is <code>true</code>', jdd.MODIFIED));
            }
        }
    },

    /**
     * Format the object into the output stream and decorate the data tree with 
     * the data about this object.
     */
    formatAndDecorate: function(/*Object*/ config, /*Object*/ data) {
        if (_.isArray(data)) {
            jdd.formatAndDecorateArray(config, data);
            return;
        }
        
        jdd.startObject(config);
        config.currentPath.push('/');
        
        var props = jdd.getSortedProperties(data);
        
        /*
         * If the first set has more than the second then we will catch it
         * when we compare values.  However, if the second has more then
         * we need to catch that here.
         */
        
        _.each(props, function(key) {
            config.out += jdd.newLine(config) + jdd.getTabs(config.indent) + '"' + key + '": ';
            config.currentPath.push(key);
            config.paths.push({
                path: jdd.generatePath(config),
                line: config.line
            });
            jdd.formatVal(data[key], config);
            config.currentPath.pop();
        });

        jdd.finishObject(config);
        config.currentPath.pop();
    },
    
    /**
     * Format the array into the output stream and decorate the data tree with 
     * the data about this object.
     */
    formatAndDecorateArray: function(/*Object*/ config, /*Array*/ data) {
        jdd.startArray(config);
        
        /*
         * If the first set has more than the second then we will catch it
         * when we compare values.  However, if the second has more then
         * we need to catch that here.
         */
        
        _.each(data, function(arrayVal, index) {
            config.out += jdd.newLine(config) + jdd.getTabs(config.indent);
            config.paths.push({
                path: jdd.generatePath(config, '[' + index + ']'),
                line: config.line
            });

            config.currentPath.push('/[' + index + ']');
            jdd.formatVal(arrayVal, config);
            config.currentPath.pop();
        });

        jdd.finishArray(config);
        config.currentPath.pop();
    },
    
    /**
     * Generate the start of the an array in the output stream and push in the new path
     */
    startArray: function(config) {
        config.indent++;
        config.out += '[';

        if (config.paths.length === 0) {
            /*
             * Then we are at the top of the array and we want to add 
             * a path for it.
             */
            config.paths.push({
                path: jdd.generatePath(config),
                line: config.line
            });
        }
        
        if (config.indent === 0) {
            config.indent++;
        }
    },
    
    /**
     * Finish the array, outdent, and pop off all the path
     */
    finishArray: function(config) {
        if (config.indent === 0) {
            config.indent--;
        }

        jdd.removeTrailingComma(config);

        config.indent--;
        config.out += jdd.newLine(config) + jdd.getTabs(config.indent) + ']';
        if (config.indent !== 0) {
            config.out += ',';
        } else {
            config.out += jdd.newLine(config);
        }
    },

    /**
     * Generate the start of the an object in the output stream and push in the new path
     */
    startObject: function(config) {
        config.indent++;
        config.out += '{';

        if (config.paths.length === 0) {
            /*
             * Then we are at the top of the object and we want to add 
             * a path for it.
             */
            config.paths.push({
                path: jdd.generatePath(config),
                line: config.line
            });
        }
        
        if (config.indent === 0) {
            config.indent++;
        }
    },

    /**
     * Finish the object, outdent, and pop off all the path
     */
    finishObject: function(config) {
        if (config.indent === 0) {
            config.indent--;
        }

        jdd.removeTrailingComma(config);

        config.indent--;
        config.out += jdd.newLine(config) + jdd.getTabs(config.indent) + '}';
        if (config.indent !== 0) {
            config.out += ',';
        } else {
            config.out += jdd.newLine(config);
        }
    },

    /**
     * Format a specific value into the output stream.
     */
    formatVal: function(val, config) { 
        if (_.isArray(val)) {
            config.out += '[';
            
            config.indent++;
            _.each(val, function(arrayVal, index) {
                config.out += jdd.newLine(config) + jdd.getTabs(config.indent);
                config.paths.push({
                    path: jdd.generatePath(config, '[' + index + ']'),
                    line: config.line
                });

                config.currentPath.push('/[' + index + ']');
                jdd.formatVal(arrayVal, config);
                config.currentPath.pop();
            });
            jdd.removeTrailingComma(config);
            config.indent--;

            config.out += jdd.newLine(config) + jdd.getTabs(config.indent) + ']' + ',';
        } else if (_.isObject(val)) {
            jdd.formatAndDecorate(config, val);
        } else if (_.isString(val)) {
            config.out += '"' + val.replace('\"', '\\"') + '",';
        } else if (_.isNumber(val)) {
            config.out += val + ',';
        } else if (_.isBoolean(val)) {
            config.out += val + ',';
        } else if (_.isNull(val)) {
            config.out += 'null,';
        } 
    },

    /**
     * Generate a JSON path based on the specific configuration and an optional property.
     */
    generatePath: function(config, prop) {
        var s = '';
        _.each(config.currentPath, function(path) {
            s += path;
        });

        if (prop) {
            s += '/' + prop;
        }

        if (s.length === 0) {
            return '/';
        } else {
            return s;
        }
    },

    /**
     * Add a new line to the output stream
     */
    newLine: function(config) {
        config.line++;
        return '\n';
    },

    /**
     * Sort all the relevant properties and return them in an alphabetical sort by property key
     */
    getSortedProperties: function(/*Object*/ obj) {
        var props = [];

        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                props.push(prop);
            }
        }

        props = props.sort(function(a, b) {
            return a.localeCompare(b);
        });

        return props;
    },
    /*
    * Grabs the value at a calculated path
    */
    getValueFromPath:  function(sourceData, path, config){
        var pathParts = path.path.split("/");
        var current = sourceData;
        for (var idx in pathParts){
            var key = pathParts[idx];
            if (key === ""){ continue;}
            try{
                current = current[key];
            }
            catch (err){
                console.log("ERROR:\n", err, "@\n", path, key);
                return null;
            }
        }
        return current;
    },
    /**
     * Generate the diff and verify that it matches a JSON path
     */
    generateDiff: function(config1, path1, config2, path2, /*String*/ msg, type) {
        if (path1 !== '/' && path1.charAt(path1.length - 1) === '/') {
            path1 = path1.substring(0, path1.length - 1);
        }

        if (path2 !== '/' && path2.charAt(path2.length - 1) === '/') {
            path2 = path2.substring(0, path2.length - 1);
        }

        var pathObj1 = _.find(config1.paths, function(path) {
            return path.path === path1;
        });

        var pathObj2 = _.find(config2.paths, function(path) {
            return path.path === path2;
        });

        if (!pathObj1) {
            throw 'Unable to find line number for (' + msg + '): ' + path1;
        }

        if (!pathObj2) {
            throw 'Unable to find line number for (' + msg + '): ' + path2;
        }
        var diff = {
            path1: pathObj1,
            path2: pathObj2,
            type: type,
            msg: msg,
            data: {
                pre: null,
                post: null
            }
        }
        if(diff.type == jdd.MODIFIED){
            diff.data.pre = jdd.getValueFromPath(jdd.pre , pathObj1, config1);
            diff.data.post = jdd.getValueFromPath(jdd.post , pathObj2, config2);
        }
        else if (diff.type == jdd.ADDED){
            diff.data.post = jdd.getValueFromPath(jdd.post , pathObj2, config2);
        }
        else if (diff.type == jdd.DELETED){
            diff.data.pre = jdd.getValueFromPath(jdd.pre , pathObj1, config1);
        }

        return diff;
    },

    /**
     * Get the current indent level
     */
    getTabs: function(/*int*/ indent) {
        var s = '';
        for (var i = 0; i < indent; i++) {
            s += '    ';
        }

        return s;
    },

    /**
     * Remove the trailing comma from the output.
     */
    removeTrailingComma: function(config) {
        /*
         * Remove the trailing comma
         */
        if (config.out.charAt(config.out.length - 1) === ',') {
            config.out = config.out.substring(0, config.out.length - 1);
        }
    },

    /**
     * Create a config object for holding differences
     */
    createConfig: function() {
        return {
            out: '',
            indent: -1,
            currentPath: [],
            paths: [],
            line: 1
        };
    },

    processDiffs: function() {
         var left = [];
         var right = [];

        _.each(jdd.diffs, function(diff, index) {
            //$('pre.left div.line' + diff.path1.line + ' span.code').addClass(diff.type).addClass('diff');
            if (_.indexOf(left, diff.path1.line) === -1) {
                /*
                $('pre.left div.line' + diff.path1.line + ' span.code').click(function() {
                    jdd.handleDiffClick(diff.path1.line, jdd.LEFT);
                });
                */
                left.push(diff.path1.line);
            }

            //$('pre.right div.line' + diff.path2.line + ' span.code').addClass(diff.type).addClass('diff');
            if (_.indexOf(right, diff.path2.line) === -1) {
                /*
                $('pre.right div.line' + diff.path2.line + ' span.code').click(function() {
                    jdd.handleDiffClick(diff.path2.line, jdd.RIGHT);
                });
                right.push(diff.path2.line);
                */
            }
        });

        jdd.diffs = jdd.diffs.sort(function(a, b) {
            return a.path1.line - b.path1.line;
        });

    }
};
