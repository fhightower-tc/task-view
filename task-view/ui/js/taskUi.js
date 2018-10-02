/* global window, document, console, $,  */
"use-strict";

var TASKUI = new Vue({
    el: "#app-content",
    data: {
        visible: false,
        tasks: [],
        recentlyDeleted: false,
        allTaskCount: 0,
        myTaskCount: 0,
        orgUsers: [],
        currentUser: {},
        newTaskName: "",
        newTaskDescription: "",
        newTaskAssignee: "",
        newTaskDueDate: "",
    },
    computed: {
        tc: function () {
            /* Start an instance of the TC SDK. */
            var tcSpaceElementId = getParameterByName('tcSpaceElementId'); // spaces mode if spaceElementId defined
            var apiSettings = {};

            if (tcSpaceElementId) {
                apiSettings = {
                    apiToken: getParameterByName('tcToken'),
                    apiUrl: getParameterByName('tcApiPath')
                };
            }
            var tc = new ThreatConnect(apiSettings);

            return tc;
        },
        tcSelectedOwner: function() {
            return getParameterByName("owner");
        },
        ignoredStatuses: function() {
            var statuses = [];
            var statusParams = getParameterArrayByName("taskStatusesToIgnore");

            for (var status in statusParams) {
                statuses.push(statusParams[status]);
            }

            return statuses;
        },
        appAnalyticsKeyName: function() {
            return getParameterByName("appAnalyticsKeyName");
        }
    },
    methods: {
        handleAppAnalytics: function() {
            /* Get the ID of the custom metric we are using for app analytics from the datastore. */
            var _this = this;

            _this.tc.db()
                .dbMethod('GET')
                .domain('organization')
                .typeName('app-data')
                .command('metricId')
                .done(function(response) {
                    // get the current value at the given index
                    var appAnalyticsId = Number(response._source.id);
                    // increment the usage counter in the custom metric for app analytics
                    _this.incrementAppAnalytics(appAnalyticsId);
                })
                .error(function(response) {
                    console.error('Unable to retrieve the appAnalytics metric ID from the datastore:', response);
                    return null;
                })
                .request();
        },
        incrementAppAnalytics: function(appAnalyticsId) {
            /* Increment the app analytics value for this app. */
            var _this = this;
            var ro = _this.tc.requestObject();
            var metricsUrl = 'v2/customMetrics/' + appAnalyticsId + '/data';

            ro.owner(_this.tcSelectedOwner)
                .requestUri(metricsUrl)
                .requestMethod('POST')
                .body({
                  "value": "1",
                  "name": _this.appAnalyticsKeyName
                })
                .contentType('application/json')
                .done(function(response) {})
                .error(function(response) {
                    console.error('Error recording app metrics:', response);
                })
                .apiRequest('customMetric');
        },
        getTaskAssignees: function(task) {
            var _this = this;

            _this.tc.tasks()
                .owner(_this.tcSelectedOwner)
                .id(task.id)
                .done(function(response) {
                    for (var i = _this.tasks.length - 1; i >= 0; i--) {
                        if (_this.tasks[i].id === task.id) {
                            _this.tasks[i].assignee = [];

                            for (var j = response.data.user.length - 1; j >= 0; j--) {
                                _this.tasks[i].assignee.push(response.data.user[j].userName);

                                if (response.data.user[j].userName === _this.currentUser) {
                                    _this.myTaskCount++;
                                }
                            }
                        }
                    }
                })
                .error(function(response) {
                    console.error('error response', response);
                })
                .retrieveAssignees();
        },
        getTaskDescription: function(task) {
            var _this = this;

            _this.tc.tasks()
                .owner(_this.tcSelectedOwner)
                .id(task.id)
                .done(function(response) {
                    for (var i = _this.tasks.length - 1; i >= 0; i--) {
                        if (_this.tasks[i].id === task.id) {
                            _this.tasks[i].description = "";
                            for (var j = response.data.length - 1; j >= 0; j--) {
                                if (response.data[j].type === 'Description') {
                                    _this.tasks[i].description = response.data[j].value;
                                }
                            }
                        }
                    }
                })
                .error(function(response) {
                    console.error('error response', response);
                })
                .retrieveAttributes();
        },
        getTasks: function() {
            /* Get tasks from ThreatConnect. */
            var _this = this;

            _this.tc.tasks()
                .owner(_this.tcSelectedOwner)
                .done(function(response) {
                    for (var i = response.data.length - 1; i >= 0; i--) {
                        // if the task is a status we're ignoring, just move on
                        if (_this.ignoredStatuses.indexOf(response.data[i].status) !== -1) {
                            continue;
                        }

                        response.data[i].visible = true;

                        if (!response.data[i].dueDate) {
                            response.data[i].dueDate = "n/aT";
                        }

                        _this.tasks.push(response.data[i]);
                        _this.allTaskCount++;
                        _this.getTaskAssignees(response.data[i]);
                        _this.getTaskDescription(response.data[i]);

                        window.setTimeout(function() {
                            // this is necessary to initialize the counts properly
                            TASKUI.showMyTasks();
                            TASKUI.showAllTasks();
                        }, 100);
                    }
                })
                .error(function(response) {
                    $.jGrowl('Unable to get tasks from the owner named "' + _this.tcSelectedOwner + '". If this is not the owner you expected, click the pencil in the upper right corner of this app to specify an owner.', {group: 'failure-growl', life: 10000});
                    console.error('Error response:', response);
                })
                .retrieve();
        },
        getCurrentUser: function() {
            var _this = this;

            _this.tc.whoami()
                .done(function(response) {
                    _this.currentUser = response.data.user;
                    // set the `newTaskAssignee` value to default to the current user
                    _this.newTaskAssignee = response.data.user.userName;
                })
                .error(function(response) {
                    $.jGrowl('Unable to get the current user. See the console for more details.', {group: 'failure-growl'});
                    console.error('error response', response);
                })
                .retrieve();
        },
        getOrgUsers: function() {
            var _this = this;

            _this.tc.owners()
                .done(function(response) {
                    var nonApiUsers = [];

                    for (var i = response.data.user.length - 1; i >= 0; i--) {
                        // this is used so that only non-api users are listed
                        if (response.data.user[i].userName.indexOf("@") !== -1) {
                            nonApiUsers.push(response.data.user[i]);
                        }
                    }

                    _this.orgUsers = nonApiUsers;
                })
                .error(function(response) {
                    $.jGrowl('Unable to get users from the organization. See the console for more details.', {group: 'failure-growl'});
                    console.error('error response', response);
                })
                .retrieveMembers();
        },
        showAllTasks: function() {
            this.allTaskCount = 0;
            for (var i = this.tasks.length - 1; i >= 0; i--) {
                this.tasks[i].visible = true;
                this.allTaskCount++;
            }
        },
        showMyTasks: function() {
            this.myTaskCount = 0;
            for (var i = this.tasks.length - 1; i >= 0; i--) {
                if (this.tasks[i].hasOwnProperty('assignee')) {
                    if (this.tasks[i].assignee.indexOf(this.currentUser.userName) !== -1) {
                        this.tasks[i].visible = true;
                        this.myTaskCount++;
                    } else {
                        this.tasks[i].visible = false;
                    }
                }
            }
        },
        _completeTask: function(taskName, taskId) {
            var _this = this;

            _this.tc.tasks()
                .owner(_this.tcSelectedOwner)
                .name(taskName)
                .id(taskId)
                .status('Completed')
                .done(function(response) {
                    $.jGrowl('Task completed!', {group: 'success-growl'});
                })
                .error(function(response) {
                     $.jGrowl('Unable to complete task: ' + response.error, {group: 'failure-growl'});
                    console.error('error response', response);
                })
                .commit();
        },
        completeTask: function(taskName) {
            var _this = this;
            // remove the task from the list of tasks
            for (var i = _this.tasks.length - 1; i >= 0; i--) {
                if (_this.tasks[i].name === taskName) {
                    if (_this.tasks[i].assignee.indexOf(_this.currentUser.userName) !== -1) {
                        _this.myTaskCount--;
                        _this.allTaskCount--;
                    } else {
                        _this.allTaskCount--;
                    }

                    _this._completeTask(_this.tasks[i].name, _this.tasks[i].id);

                    _this.tasks[i].selected = false;
                    _this.tasks.splice(i, 1);
                    break;
                }
            }

            // // show an option to undo the operation
            // this.recentlyDeleted = true;
            // var _this = this;
            // window.setTimeout(function() {
            //     _this.recentlyDeleted = false;
            // }, 5000);
        },
        // undoCompleteTask: function() {
        //     console.log("undoing task completion");
        // },
        getSelectedTaskNames: function() {
            var selectedTaskNames = [];
            // get all of the selected tasks
            for (var i = this.tasks.length - 1; i >= 0; i--) {
                if (this.tasks[i].selected) {
                    selectedTaskNames.push(this.tasks[i].name);
                }
            }
            return selectedTaskNames;
        },
        completeTasks: function() {
            // get the selected tasks
            var selectedTaskNames = this.getSelectedTaskNames();

            if (selectedTaskNames.length === 0) {
                $.jGrowl('Please select at least one task to complete it', {group: 'failure-growl'});
                return;
            }

            // confirm that the user wants to complete the tasks
            var completeTasksConfirm = false;
            if (confirm("Are you sure you want to complete " + selectedTaskNames.length + " tasks?") === true) {
                completeTasksConfirm = true;
            }

            if (completeTasksConfirm) {
                for (var i = selectedTaskNames.length - 1; i >= 0; i--) {
                    this.completeTask(selectedTaskNames[i]);
                }
            }
        },
        addAttribute: function(task) {
            var _this = this;
            var tasks = _this.tc.tasks();

            if (_this.newTaskDescription === '') {
                return;
            }

            tasks.owner(_this.tcSelectedOwner)
               .id(task.id)
               .done(function(response) {
                    for (var i = _this.tasks.length - 1; i >= 0; i--) {
                        if (_this.tasks[i].id === task.id) {
                            _this.tasks[i].description = _this.newTaskDescription;
                        }
                    }
                    _this.newTaskDescription = '';
               })
               .error(function(response) {
                    $.jGrowl('Unable to add attribute to the task: ' + response.error, {group: 'failure-growl'});
                   console.error('error response', response);
                   $('#createTaskModalButton').prop('disabled', false);
               });

            tasks.commitAttribute({
                type: 'Description',
                value: _this.newTaskDescription,
                displayed: true
            });
        },
        createTask: function() {
            var _this = this;
            var tasks = _this.tc.tasks();

            if (_this.newTaskName === "") {
                $.jGrowl('Please enter a name for the task.', {group: 'failure-growl'});
                $('#taskNameInput').focus();
                return;
            }

            $('#createTaskModalButton').prop('disabled', true);

            tasks.owner(_this.tcSelectedOwner)
               .name(_this.newTaskName)
               .done(function(response) {
                    $.jGrowl('Task created', {group: 'success-growl'});
                    if (!response.data.dueDate) {
                        response.data.dueDate = "n/aT";
                    }

                    _this.newTaskName = "";
                    _this.newTaskDueDate = "";
                    _this.tasks.push(response.data);
                    _this.addAttribute(response.data);
                    _this.getTaskAssignees(response.data);

                    _this.allTaskCount++;
                    $('#createTaskModalButton').prop('disabled', false);
                    $('#createTaskModal').foundation('close');

                    window.setTimeout(function() {
                        $('#myTasksButton').click();
                        TASKUI.showMyTasks();
                    }, 1000);
               })
               .error(function(response) {
                    $.jGrowl('Unable to create task: ' + response.error, {group: 'failure-growl'});
                   console.error('error response', response);
                   $('#createTaskModalButton').prop('disabled', false);
               });

            if (_this.newTaskAssignee !== "") {
                tasks.assignee([{'userName': _this.newTaskAssignee}]);
            }

            if (_this.newTaskDueDate !== "") {
                var formattedDueDate = _this.newTaskDueDate + "T00:00:00Z";
                tasks.dueDate(formattedDueDate);
            }

            tasks.commit();
        },
        startApp: function() {
            // make the main app div visible (this prevents a flash of un-styled content)
            this.visible = true;
            // start the zurb foundation scripts
            window.setTimeout(function() {
                $(document).foundation();
                // handle the button groups
                $('[data-mobile-app-toggle] .button').click(function () {
                  $(this).siblings().removeClass('is-active');
                  $(this).addClass('is-active');
                });
            }, 1);
            // increment the usage counter in the custom metric for app analytics
            this.handleAppAnalytics();
            this.getTasks();
            this.getCurrentUser();
            this.getOrgUsers();
        }
    }
});

$(document).on('open.zf.reveal', '[data-reveal]', function() {
    // focus on the task name input box
    try {
        $('#taskNameInput').focus();
    }
    catch(err) {}
});
