/*
 * Licensed to Apereo under one or more contributor license
 * agreements. See the NOTICE file distributed with this work
 * for additional information regarding copyright ownership.
 * Apereo licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file
 * except in compliance with the License.  You may obtain a
 * copy of the License at the following location:
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

(function () {
    var app = angular.module('casmgmt', [
            'ui.sortable',
        ]);

    app.filter('checkmark', function () {
            return function (input) {
                return input ? '\u2713' : '\u2718';
            };
        })
        .filter('wordCharTrunc', function () {
            return function (str, limit) {
                if(typeof str != 'string') { return ''; }
                if(!limit || str.length <= limit) { return str; }

                var newStr = str.substring(0, limit).replace(/\w+$/, '');
                return (newStr || str.substring(0, limit)) + '...';
            };
        })
        .filter('serviceTableFilter', function () {
            return function (services, fields, regex) {
                if(typeof fields == 'string') { fields = [fields]; }
                try {
                    regex = regex ? new RegExp(regex, 'i') : false;
                } catch(e) {
                    // TODO: How do we want to tell the user their regex is bad? On error, return list or null?
                    regex = false;
                }
                if(!services || !fields || !regex) { return services; }

                var matches = [];
                angular.forEach(services, function (service, i) {
                    angular.forEach(fields, function (field, j) {
                        if(regex.test(service[field]) && matches.indexOf(service) == -1) {
                            matches.push(service);
                        }
                    });
                });
                return matches;
            };
        });

    app.factory('sharedFactoryCtrl', [
        '$log',
        function ($log) {
            var factory = {assignedId: 0};

            factory.setItem = function (id) {
                factory.assignedId = id;
            };
            factory.clearItem = function () {
                factory.assignedId = null;
            };
            factory.getItem = function () {
                return factory.assignedId;            
            };

            return factory;
        }
    ]);

// View Swapper
    app.controller('actionsController', [
        'sharedFactoryCtrl',
        function (sharedFactory) {
            this.actionPanel = 'manage';

            this.selectAction = function (setAction) {
                this.actionPanel = setAction;
            };

            this.isSelected = function (checkAction) {
                return this.actionPanel === checkAction;
            };

            this.homepage = function () {
                this.selectAction('manage');
                sharedFactory.clearItem();
            };

            this.serviceAdd = function () {
                sharedFactory.clearItem();
                this.selectAction('add');
            };

            this.serviceEdit = function (id) {
                sharedFactory.setItem(id);
                this.selectAction('edit');
            };
        }
    ]);

// Services Table: Manage View
    app.controller('ServicesTableController', [
        '$http',
        '$log',
        '$timeout',
        'sharedFactoryCtrl',
        function ($http, $log, $timeout, sharedFactory) {
            var servicesData = this,
                csrfHeader = {};

            csrfHeader[ $("meta[name='_csrf_header']").attr("content") ] = $("meta[name='_csrf']").attr("content");

            this.dataTable = [];
            this.sortableOptions = {
                axis: 'y',
                items: '> tr',
                handle: '.grabber-icon',
                placeholder: 'tr-placeholder',
                start: function (e, ui) {
                    servicesData.detailRow = -1;
                    ui.item.data('data_changed', false);
                },
                update: function (e, ui) {
                    ui.item.data('data_changed', true);
                },
                stop: function (e, ui) {
                    if(ui.item.data('data_changed')) {
                        var myData = $(this).sortable('serialize', {key: 'id'});

                        $http.post('/cas-management/updateRegisteredServiceEvaluationOrder.html', myData, {headers: csrfHeader})
                            .success(function (data) {
                                servicesData.getServices();
                            })
                            .error(function(data, status) {
                                $log.log('err');
                                servicesData.alert = {
                                    name:   'notupdated',
                                    type:   'danger',
                                    data:   null
                                };
                            });
                    }
                }
            };

            this.getServices = function () {
                $http.get('/cas-management/getServices.html')
                    .success(function (data) {
                        servicesData.dataTable = data.services || [];
                    })
                    .error(function (data, status) {
                        servicesData.alert = {
                            name:   'listfail',
                            type:   'danger',
                            data:   null
                        };
                    });
            };

            this.openModalDelete = function (item) {
                servicesData.modalItem = item;
                $timeout(function () {
                    $('#confirm-delete .btn-default').focus();
                }, 100);
            };
            this.closeModalDelete = function () {
                servicesData.modalItem = null;
            };
            this.deleteService = function (item) {
                servicesData.closeModalDelete();
                $http.post('/cas-management/deleteRegisteredService.html', {id: item.assignedId}, {headers: csrfHeader})
                    .success(function (data) {
                        servicesData.getServices();
                        servicesData.alert = {
                            name:   'deleted',
                            type:   'info',
                            data:   item
                        };
                    })
                    .error(function(data, status) {
                        servicesData.alert = {
                            name:   'notdeleted',
                            type:   'danger',
                            data:   null
                        };
                    });
            };

            this.clearFilter = function () {
                servicesData.serviceTableQuery = "";
            };

            this.toggleDetail = function (rowId) {
                servicesData.detailRow = servicesData.detailRow == rowId ? -1 : rowId;
            };

            this.getServices();
        }
    ]);

// Service Form: Add/Edit Service View
    app.controller('ServiceFormController', [
        '$scope',
        '$http',
        '$log',
        'sharedFactoryCtrl',
        function ($scope, $http, $log, sharedFactory) {
            var serviceForm = this,
                showInstructions = function () {
                    serviceForm.alert = {
                        name:   'instructions',
                        type:   'info',
                        data:   null
                    };
                };

            this.formData = {};
            this.formErrors = null;

            // TODO: this.keyMaps // should hold all of the "this.* = [ {} {} {} ];"" below

            this.serviceTypeList = [
                {name: 'CAS Client',    value: 'cas'},
                {name: 'OAuth Client',  value: 'oauth'}
            ];
            this.serviceType = this.serviceTypeList[0];

            this.logoutTypeList = [
                {name: '0 - None',          value: 'none'},
                {name: '1 - BACK_CHANNEL',  value: 'back'},
                {name: '2 - FRONT_CHANNEL', value: 'front'}
            ];
            this.logoutType = this.logoutTypeList[0];

            this.publicKeyAlgorithmList = [
                {name: 'RSA', value: 'rsa'}
            ];
            this.publicKeyAlgorithm = this.publicKeyAlgorithmList[0];

            this.themeList=[
                {name: '(No Theme)',    value: ''},
                {name: 'Theme 01',      value: 'theme01'},
                {name: 'Theme 02',      value: 'theme02'}
            ];
            this.themeType = this.themeList[0];

            this.reqHandlerList = [
                {name: 'Required Handler 1', value: 'reqHandler01'},
                {name: 'Required Handler 2', value: 'reqHandler02'},
                {name: 'Required Handler 3', value: 'reqHandler03'},
                {name: 'Required Handler 4', value: 'reqHandler04'},
                {name: 'Required Handler 5', value: 'reqHandler05'}
            ];
            this.reqHandler = this.reqHandlerList[0];

            this.timeUnits = [
                'MILLISECONDS',
                'SECONDS',
                'MINUTES',
                'HOURS',
                'DAYS'
            ];

            this.saveForm = function () {
                serviceForm.validateForm();

                if(serviceForm.formErrors) {
                    serviceForm.alert = {
                        name:   'notvalid',
                        type:   'danger',
                        data:   serviceForm.formErrors // .length?
                    };
                    return;
                }

                $http.post('/cas-management/forcedError', serviceForm.formData)  // TODO: fix this call
                    .success(function (data) {
                        serviceForm.formData = data[0];
                        serviceForm.alert = {
                            name:   'saved',
                            type:   'info',
                            data:   null
                        };
                    })
                    .error(function (data, status) {
                        serviceForm.alert = {
                            name:   'notsaved',
                            type:   'danger',
                            data:   data
                        };
                    });
            };

            this.validateForm = function () {
                serviceForm.formErrors = null;

                // TODO: actual testing goes here
                serviceForm.formErrors = ['form not yet working'];
            };

            this.newService = function () {
                serviceForm.formData = {
                    evalOrder: 100,
                    sas: {casEnabled: true},
                    userAttrProvider: {type: 'default'},
                    proxyPolicy: {type: 'refuse'},
                    attrRelease: {
                        attrOption: 'default',
                        attrPolicy: {type: 'all'}
                    }
                };
                showInstructions();
            };

            this.loadService = function (id) {
                $http.get('js/app/data/service-' + id + '.json') // TODO: fix URL
                    .success(function (data) {
                        serviceForm.formData = data[0];
                    })
                    .error(function (data, status) {
                        serviceForm.alert = {
                            name:   'notloaded',
                            type:   'danger',
                            data:   data
                        };
                    });
                showInstructions();
            };

            $scope.$watch(
                function() { return sharedFactory.serviceId; },
                function (serviceId) {
                    serviceForm.alert = null;
                    if(!serviceId) { serviceForm.newService(); }
                    else { serviceForm.loadService(serviceId); }
                }
            );
        }
    ]);

})();
