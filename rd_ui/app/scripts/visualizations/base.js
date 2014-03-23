(function () {
    var VisualizationProvider = function() {
        this.visualizations = {};
        this.visualizationTypes = {};
        var defaultConfig = {
            defaultOptions: {},
            skipTypes: false,
            editorTemplate: null
        }

        this.registerVisualization = function(config) {
            var visualization = _.extend({}, defaultConfig, config);

            // TODO: this is prone to errors; better refactor.
            if (_.isEmpty(this.visualizations)) {
                this.defaultVisualization = visualization;
            }

            this.visualizations[config.type] = visualization;

            if (!config.skipTypes) {
                this.visualizationTypes[config.name] = config.type;
            };
        };

        this.getSwitchTemplate = function(property) {
            var pattern = /(<[a-zA-Z0-9-]*?)( |>)/

            var mergedTemplates = _.reduce(this.visualizations, function(templates, visualization) {
                if (visualization[property]) {
                    var ngSwitch = '$1 ng-switch-when="' + visualization.type + '" $2';
                    var template = visualization[property].replace(pattern, ngSwitch);

                    return templates + "\n" + template;
                }

                return templates;
            }, "");

            mergedTemplates = '<div ng-switch on="visualization.type">'+ mergedTemplates + "</div>";

            return mergedTemplates;
        }

        this.$get = ['$resource', function($resource) {
            var Visualization = $resource('/api/visualizations/:id', {id: '@id'});
            Visualization.visualizations = this.visualizations;
            Visualization.visualizationTypes = this.visualizationTypes;
            Visualization.renderVisualizationsTemplate = this.getSwitchTemplate('renderTemplate');
            Visualization.editorTemplate = this.getSwitchTemplate('editorTemplate');
            Visualization.defaultVisualization = this.defaultVisualization;

            return Visualization;
        }];
    };

    var VisualizationRenderer = function(Visualization) {
        return {
            restrict: 'E',
            scope: {
                visualization: '=',
                queryResult: '='
            },
            // TODO: using switch here (and in the options editor) might introduce errors and bad
            // performance wise. It's better to eventually show the correct template based on the
            // visualization type and not make the browser render all of them.
            template: '<filters></filters>\n' + Visualization.renderVisualizationsTemplate,
            replace: false,
            link: function(scope) {
                scope.$watch('queryResult && queryResult.getFilters()', function(filters) {
                    if (filters) {
                        scope.filters = filters;
                    }
                });
            }
        }
    };

    var VisualizationOptionsEditor = function(Visualization) {
        return {
            restrict: 'E',
            template: Visualization.editorTemplate,
            replace: false
        }
    };

    var Filters = function() {
        return {
            restrict: 'E',
            templateUrl: '/views/visualizations/filters.html'
        }
    }

    var EditVisualizationForm = function(Visualization, growl) {
        return {
            restrict: 'E',
            templateUrl: '/views/visualizations/edit_visualization.html',
            replace: true,
            scope: {
                query: '=',
                queryResult: '=',
                visualization: '=?'
            },
            link: function (scope, element, attrs) {
                scope.visTypes = Visualization.visualizationTypes;

                scope.newVisualization = function(q) {
                    return {
                        'query_id': q.id,
                        'type': Visualization.defaultVisualization.type,
                        'name': Visualization.defaultVisualization.name,
                        'description': q.description || '',
                        'options': Visualization.defaultVisualization.defaultOptions
                    };
                }

                if (!scope.visualization) {
                    // create new visualization
                    // wait for query to load to populate with defaults
                    var unwatch = scope.$watch('query', function (q) {
                        if (q && q.id) {
                            unwatch();

                            scope.visualization = scope.newVisualization(q);
                        }
                    }, true);
                }

                scope.$watch('visualization.type', function (type, oldType) {
                    // if not edited by user, set name to match type
                    if (type && oldType != type && scope.visualization && !scope.visForm.name.$dirty) {
                        // poor man's titlecase
                        scope.visualization.name = scope.visualization.type[0] + scope.visualization.type.slice(1).toLowerCase();
                    }
                });

                scope.submit = function () {
                    Visualization.save(scope.visualization, function success(result) {
                        growl.addSuccessMessage("Visualization saved");

                        scope.visualization = scope.newVisualization(scope.query);

                        var visIds = _.pluck(scope.query.visualizations, 'id');
                        var index = visIds.indexOf(result.id);
                        if (index > -1) {
                            scope.query.visualizations[index] = result;
                        } else {
                            scope.query.visualizations.push(result);
                        }
                    }, function error() {
                        growl.addErrorMessage("Visualization could not be saved");
                    });
                };
            }
        }
    };



    angular.module('redash.visualization', [])
        .provider('Visualization', VisualizationProvider)
        .directive('visualizationRenderer', ['Visualization', VisualizationRenderer])
        .directive('visualizationOptionsEditor', ['Visualization', VisualizationOptionsEditor])
        .directive('filters', Filters)
        .directive('editVisulatizationForm', ['Visualization', 'growl', EditVisualizationForm])
})();