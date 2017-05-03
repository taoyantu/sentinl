/*
 * Copyright 2016, Lorenzo Mangani (lorenzo.mangani@gmail.com)
 * Copyright 2015, Rao Chenlin (rao.chenlin@gmail.com)
 *
 * This file is part of Sentinl (http://github.com/sirensolutions/sentinl)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import _ from 'lodash';
import moment from 'moment';
import chrome from 'ui/chrome';
import uiModules from 'ui/modules';
import uiRoutes from 'ui/routes';

/* import controllers */
import './controllers/reportController';

/* import directives */
import './directives/watcherWizzard/watcher-wizzard';
import './directives/newAction/new-action';
import './directives/emailAction/email-action';
import './directives/emailHtmlAction/emailHtml-action';
import './directives/webhookAction/webhook-action';
import './directives/reportAction/report-action';
import './directives/slackAction/slack-action';
import './directives/consoleAction/console-action';
import './directives/scheduleTag/schedule-tag';

import $ from 'jquery';

/* Elasticsearch */
import elasticsearch from 'elasticsearch-browser';

/* Ace editor */
import ace from 'ace';

/* Timepicker */
import 'ui/timepicker';
import 'ui/courier';
import 'ui/filter_bar';

// import TableVisTypeProvider from 'ui/template_vis_type/TemplateVisType';
// import VisSchemasProvider from 'ui/vis/schemas';
// import tableVisTemplate from 'plugins/table_vis/table_vis.html';
// require('ui/registry/vis_types').register(TableVisTypeProvider);

import AggResponseTabifyTabifyProvider from 'ui/agg_response/tabify/tabify';
// import tableSpyModeTemplate from 'plugins/spy_modes/table_spy_mode.html';

import Notifier from 'ui/notify/notifier';
// import 'ui/autoload/styles';

/* Custom Template + CSS */
import './less/main.less';
import template from './templates/index.html';
import about from './templates/about.html';
import alarms from './templates/alarms.html';
import reports from './templates/reports.html';
import jsonHtml from './templates/json.html';
import confirmBox from './templates/confirm-box.html';
import watcherForm from './templates/watcher/form.html';

var impactLogo = require('plugins/sentinl/sentinl_logo.svg');
var smallLogo = require('plugins/sentinl/sentinl.svg');

chrome
  .setBrand({
    logo: 'url(' + impactLogo + ') left no-repeat',
    smallLogo: 'url(' + smallLogo + ') left no-repeat'
  })
  .setNavBackground('#222222')
  .setTabs([
    {
      id: '',
      title: 'Watchers',
      activeIndicatorColor: '#EFF0F2'
    },
    {
      id: 'alarms',
      title: 'Alarms',
      activeIndicatorColor: '#EFF0F2'
    },
    {
      id: 'reports',
      title: 'Reports',
      activeIndicatorColor: '#EFF0F2'
    },
    {
      id: 'about',
      title: 'About',
      activeIndicatorColor: '#EFF0F2'
    }
  ]);

uiRoutes.enable();

uiRoutes
.when('/', {
  template,
  resolve: {
    currentTime($http) {
      return $http.get('../api/sentinl/example')
      .then((resp) => resp.data.time);
    }
  }
});

uiRoutes
.when('/alarms', {
  template: alarms,
  resolve: {
    currentTime($http) {
      return $http.get('../api/sentinl/example').then(function (resp) {
        return resp.data.time;
      });
    }
  }
});

uiRoutes
.when('/reports', {
  template: reports,
  resolve: {
    currentTime($http) {
      return $http.get('../api/sentinl/example').then(function (resp) {
        return resp.data.time;
      });
    }
  }
});

uiRoutes
.when('/about', {
  template: about
});

uiModules
.get('api/sentinl', [])
.filter('moment', function () {
  return function (dateString) {
    return moment(dateString).format('YYYY-MM-DD HH:mm:ss.sss');
  };
})
.controller('sentinlHelloWorld', function ($rootScope, $scope, $route, $interval,
  $timeout, timefilter, Private, Notifier, $window, kbnUrl, $http) {
  $scope.title = 'Sentinl: Alarms';
  $scope.description = 'Kibana Alert App for Elasticsearch';

  $scope.notify = new Notifier();

  timefilter.enabled = true;

  /* Update Time Filter */
  var updateFilter = function () {
    return $http.get('../api/sentinl/set/interval/' + JSON.stringify($scope.timeInterval).replace(/\//g, '%2F'));
  };

  /* First Boot */

  $scope.elasticAlarms = [];
  $scope.timeInterval = timefilter.time;
  updateFilter();
  $http.get('../api/sentinl/list/alarms')
  .then(
    (resp) => $scope.elasticAlarms = resp.data.hits.hits,
    $scope.notify.error
  );

  /* Listen for refreshInterval changes */

  $rootScope.$watchCollection('timefilter.time', function (newvar, oldvar) {
    if (newvar === oldvar) { return; }
    let timeInterval = _.get($rootScope, 'timefilter.time');
    if (timeInterval) {
      $scope.timeInterval = timeInterval;
      updateFilter();
      $route.reload();
    }
  });

  $rootScope.$watchCollection('timefilter.refreshInterval', function () {
    let refreshValue = _.get($rootScope, 'timefilter.refreshInterval.value');
    let refreshPause = _.get($rootScope, 'timefilter.refreshInterval.pause');

    // Kill any existing timer immediately
    if ($scope.refreshalarms) {
      $timeout.cancel($scope.refreshalarms);
      $scope.refreshalarms = undefined;
    }

    // Check if Paused
    if (refreshPause) {
      if ($scope.refreshalarms) $timeout.cancel($scope.refreshalarms);
      return;
    }

    // Process New Filter
    if (refreshValue !== $scope.currentRefresh && refreshValue !== 0) {
      // new refresh value
      if (_.isNumber(refreshValue) && !refreshPause) {
        $scope.newRefresh = refreshValue;
        // Reset Interval & Schedule Next
        $scope.refreshalarms = $timeout(function () {
          $route.reload();
        }, refreshValue);
        $scope.$watch('$destroy', $scope.refreshalarms);
      } else {
        $scope.currentRefresh = 0;
        $timeout.cancel($scope.refreshalarms);
      }
    } else {
      $timeout.cancel($scope.refreshalarms);
    }
  });

  $scope.deleteAlarm = function (index, rmindex, rmtype, rmid) {
    if (confirm('Delete is Forever!\n Are you sure?')) {
      return $http.delete('../api/sentinl/alarm/' + rmindex + '/' + rmtype + '/' + rmid)
      .then(() => {
        $timeout(() => {
          $scope.elasticAlarms.splice(index - 1, 1);
          $scope.notify.warning('SENTINL Alarm log successfully deleted!');
          $route.reload();
        }, 1000);
      })
      .catch($scope.notify.error);
    }
  };

  $scope.deleteAlarmLocal = function (index) {
    $scope.notify.warning('SENTINL function not yet implemented!');
  };

  var currentTime = moment($route.current.locals.currentTime);
  $scope.currentTime = currentTime.format('HH:mm:ss');
  var utcTime = moment.utc($route.current.locals.currentTime);
  $scope.utcTime = utcTime.format('HH:mm:ss');
  var unsubscribe = $interval(function () {
    $scope.currentTime = currentTime.add(1, 'second').format('HH:mm:ss');
    $scope.utcTime = utcTime.add(1, 'second').format('HH:mm:ss');
  }, 1000);
  $scope.$watch('$destroy', unsubscribe);

});


uiModules
.get('api/sentinl', [])
.controller('ConfirmCtrl', function ($scope, $modalInstance, action) {

  $scope.actionName = action;

  $scope.yes = function () {
    $modalInstance.close('yes');
  };

  $scope.no = function () {
    $modalInstance.dismiss('no');
  };

});


// WATCHER FORM CONTROLLER
uiModules
.get('api/sentinl', [])
.controller('WatcherFormCtrl', function ($scope, $modalInstance, $modal, $log, watcher) {

  $scope.notify = new Notifier();

  $scope.watcher = watcher;

  $scope.form = {
    status: !$scope.watcher._source.disable ? 'Enabled' : 'Disable',
    actions: {
      new: {
        edit: false
      },
      types: [ 'webhook', 'email', 'email_html', 'report', 'slack', 'console' ]
    }
  };

  $scope.aceOptions = function (mode, lines = 10) {
    return {
      mode: mode,
      useWrapMode : true,
      showGutter: true,
      rendererOptions: {
        maxLines: lines,
        minLines: 5
      },
      editorOptions: {
        autoScrollEditorIntoView: false
      },
      onLoad: function (_editor) {
        _editor.$blockScrolling = Infinity;
      }
    };
  };

  const initActionTitles = function () {
    _.forOwn($scope.watcher._source.actions, (settings, name) => { settings._title = name; });
  };

  const initSchedule = function () {
    $scope.watcher._source._schedule = {
      hours: 0,
      mins: 0,
      secs: 0
    };
    _.each($scope.watcher._source.trigger.schedule.later.split(','), (period) => {
      if (period.match(/hour/i)) {
        $scope.watcher._source._schedule.hours = +_.trim(period).split(' ')[1];
      }
      if (period.match(/min/i)) {
        $scope.watcher._source._schedule.mins = +_.trim(period).split(' ')[1];
      }
      if (period.match(/sec/i)) {
        $scope.watcher._source._schedule.secs = +_.trim(period).split(' ')[1];
      }
    });
  };

  const initThrottlePeriods = function () {
    const getHours = function (str) {
      return str.match(/([0-9]?[0-9])h/i) ? +str.match(/([0-9]?[0-9])h/i)[1] : 0;
    };
    const getMins = function (str) {
      return str.match(/([0-9]?[0-9])m/i) ? +str.match(/([0-9]?[0-9])m/i)[1] : 0;
    };
    const getSecs = function (str) {
      return str.match(/([0-9]?[0-9])s/i) ? +str.match(/([0-9]?[0-9])s/i)[1] : 0;
    };

    _.forOwn($scope.watcher._source.actions, (actions) => {
      actions._throttle = {
        hours: getHours(actions.throttle_period),
        mins: getMins(actions.throttle_period),
        secs: getSecs(actions.throttle_period)
      };
    });
  };

  const saveSchedule = function () {
    let schedule = [];
    _.forOwn($scope.watcher._source._schedule, (value, key) => {
      if (value) {
        schedule.push(`every ${value} ${key}`);
      }
    });
    $scope.watcher._source.trigger.schedule.later = schedule.join(', ');
    delete $scope.watcher._source._schedule;
  };

  const saveThrottle = function () {
    _.forOwn($scope.watcher._source.actions, (action) => {
      _.forOwn(action._throttle, (value, key) => {
        if (!value) action._throttle[key] = 0;
      });
      action.throttle_period = `${action._throttle.hours}h${action._throttle.mins}m${action._throttle.secs}s`;
      delete action._throttle;
    });
  };

  $scope.toggleWatcher = function () {
    if (!$scope.watcher._source.disable) {
      $scope.form.status = 'Enabled';
      $scope.watcher._source.disable = false;
    } else {
      $scope.form.status = 'Disabled';
      $scope.watcher._source.disable = true;
    }
  };

  $scope.removeAction = function (actionName) {
    const confirmModal = $modal.open({
      template: confirmBox,
      controller: 'ConfirmCtrl',
      size: 'sm',
      resolve: {
        action: function () {
          return actionName;
        }
      }
    });

    confirmModal.result.then((response) => {
      if (response === 'yes') {
        delete $scope.watcher._source.actions[actionName];
      }
    }, () => {
      $log.info(`You choose not deleting the action "${actionName}"`);
    });
  };

  $scope.addAction = function () {
    $scope.form.actions.new.edit = !$scope.form.actions.new.edit;
  };

  $scope.editAction = function (actionName, actionSettings) {
    // toggle edit for the selected action
    _.each($scope.form.actions.types, (type) => {
      if (_.has(actionSettings, type)) {
        actionSettings[type]._edit = !actionSettings[type]._edit;
      }
    });

    // edit one action at a time
    // close all other actions
    _.forOwn($scope.watcher._source.actions, (settings, name) => {
      _.each($scope.form.actions.types, (type) => {
        if (_.has(settings, type)) {
          if (name !== actionName) settings[type]._edit = false;
        }
      });
    });
  };

  const renameActions = function (actions) {
    const newActions = {};
    _.forOwn(actions, (settings, name) => {
      newActions[settings._title] = settings;
      delete newActions[settings._title]._title;
    });
    return newActions;
  };

  const saveEditorsText = function () {

    _.each(['_input', '_condition', '_transform'], (field) => {
      if (_.has($scope.watcher._source, field)) {
        if ($scope.watcher._source[field]) {
          if (field === '_input') {
            $scope.watcher._source[field.substring(1)] = JSON.parse($scope.watcher._source[field]);
          } else {
            $scope.watcher._source[field.substring(1)].script.script = $scope.watcher._source[field];
          }
        }
        delete $scope.watcher._source[field];
      }
    });

    _.forOwn($scope.watcher._source.actions, (settings, name) => {
      _.each($scope.form.actions.types, (type) => {
        if (_.has(settings, type)) {
          delete settings[type]._edit;
        }

        if (type === 'webhook' && _.has(settings, type)) {
          if (settings[type]._headers) {
            settings[type].headers = JSON.parse(settings[type]._headers);
            delete settings[type]._headers;
          }
          delete settings[type]._proxy;
        }
      });
    });

  };

  const init = function () {
    initActionTitles();
    initSchedule();
    initThrottlePeriods();
    $scope.watcher._source._input = JSON.stringify($scope.watcher._source.input, null, 2);
    $scope.watcher._source._transform = $scope.watcher._source.transform.script.script;
    $scope.watcher._source._condition = $scope.watcher._source.condition.script.script;
  };

  init();

  $scope.save = function () {
    try {
      if ($scope.watcher._source._input && $scope.watcher._source._input.length) {
        JSON.parse($scope.watcher._source._input);
      }
    } catch (e) {
      $scope.notify.error(e);
      $scope.watcherForm.$valid = false;
      $scope.watcherForm.$invalid = true;
    }

    if ($scope.watcherForm.$valid) {
      saveSchedule();
      saveThrottle();
      saveEditorsText();
      $scope.watcher._source.actions = renameActions($scope.watcher._source.actions);
      $modalInstance.close($scope.watcher);
    }
  };

  $scope.cancel = function () {
    $modalInstance.dismiss('cancel');
  };
});

// WATCHERS CONTROLLER
uiModules
.get('api/sentinl', [])
.controller('sentinlWatchers', function ($rootScope, $scope, $route, $interval,
  $timeout, timefilter, Private, Notifier, $window, kbnUrl, $http, $modal, $log) {
  const tabifyAggResponse = Private(AggResponseTabifyTabifyProvider);

  $scope.title = 'Sentinl: Watchers';
  $scope.description = 'Kibana Alert App for Elasticsearch';

  $scope.notify = new Notifier();

  $scope.topNavMenu = [
    {
      key: 'watchers',
      description: 'WATCH',
      run: function () { kbnUrl.change('/'); }
    },
    {
      key: 'about',
      description: 'ABOUT',
      run: function () { kbnUrl.change('/about'); }
    }
  ];

  timefilter.enabled = false;

  $scope.watchers = [];

  function importWatcherFromLocalStorage() {
    /* New Entry from Saved Kibana Query */
    if ($window.localStorage.getItem('sentinl_saved_query')) {
      $scope.watcherNew(JSON.parse($window.localStorage.getItem('sentinl_saved_query')));
      $window.localStorage.removeItem('sentinl_saved_query');
    }
  };

  $scope.openWatcherEditorForm = function ($index) {

    const formModal = $modal.open({
      template: watcherForm,
      controller: 'WatcherFormCtrl',
      size: 'lg',
      resolve: {
        watcher: function () {
          return $scope.watchers[$index];
        },
      }
    });

    formModal.result.then((watcher) => {
      $scope.watchers[$index] = watcher;
      $scope.watcherSave($index, true);
    }, () => {
      $log.info('You choose to close watcher form');
    });
  };

  $http.get('../api/sentinl/list')
  .then((response) => {
    $scope.watchers = response.data.hits.hits;
    importWatcherFromLocalStorage();
  })
  .catch((error) => {
    $scope.notify.error(error);
    importWatcherFromLocalStorage();
  });

  /* ACE Editor */
  $scope.editor;
  $scope.editor_status = { readonly: false, undo: false, new: false };
  $scope.setAce = function ($index, edit) {
    $scope.editor = ace.edit('editor-' + $index);
    var _session = $scope.editor.getSession();
    $scope.editor.setReadOnly(edit);
    $scope.editor_status.readonly = edit;
    _session.setUndoManager(new ace.UndoManager());

    $scope.editor_status.undo = $scope.editor.session.getUndoManager().isClean();

    if (!edit) { $scope.editor.getSession().setMode('ace/mode/json'); }
    else { $scope.editor.getSession().setMode('ace/mode/text'); }
  };

  $scope.watcherDelete = function ($index) {
    if (confirm('Are you sure?')) {
      return $http.delete('../api/sentinl/watcher/' + $scope.watchers[$index]._id)
      .then(
        (resp) => {
          $timeout(function () {
            $route.reload();
            $scope.notify.warning('SENTINL Watcher successfully deleted!');
          }, 1000);
        },
        $scope.notify.error
      );
    }
  };

  $scope.watcherSave = function ($index, callFromWatcherEditorForm = false) {
    let watcher;
    if ($scope.editor && !callFromWatcherEditorForm) {
      watcher = JSON.parse($scope.editor.getValue());
    } else {
      watcher = $scope.watchers[$index];
    }

    console.log('saving object:', watcher);
    return $http.post(`../api/sentinl/watcher/${watcher._id}`, watcher)
    .then(
      () => {
        $timeout(() => {
          $route.reload();
          $scope.notify.warning('SENTINL Watcher successfully saved!');
        }, 1000);
      },
      $scope.notify.error
    );
  };

  $scope.getWatchers = function () {
    return $scope.watchers;
  };

  /* New Entry */
  $scope.watcherNew = function (newwatcher) {
    if (!newwatcher) {
      var wid = 'new_watcher_' + Math.random().toString(36).substr(2, 9);
      newwatcher = {
        _index: 'watcher',
        _type: 'watch',
        _id: wid,
        _new: 'true',
        _source: {
          title: 'watcher_title',
          disable: false,
          uuid: wid,
          trigger: {
            schedule: {
              later: 'every 5 minutes'
            }
          },
          input: {
            search: {
              request: {
                index: [],
                body: {},
              }
            }
          },
          condition: {
            script: {
              script: 'payload.hits.total > 100'
            }
          },
          transform: {
            script: {
              script: ''
            }
          },
          actions: {
            email_admin: {
              throttle_period: '15m',
              email: {
                to: 'alarm@localhost',
                from: 'sentinl@localhost',
                subject: 'Sentinl Alarm',
                priority: 'high',
                body: 'Found {{payload.hits.total}} Events'
              }
            }
          }
        }
      };
    }
    $scope.watchers.unshift(newwatcher);
  };
  $scope.reporterNew = function (newwatcher) {
    if (!newwatcher) {
      var wid = 'reporter_' + Math.random().toString(36).substr(2, 9);
      newwatcher = {
        _index: 'watcher',
        _type: 'watch',
        _id: wid,
        _new: 'true',
        _source: {
          title: 'reporter_title',
          disable: false,
          uuid: wid,
          trigger: {
            schedule: {
              later: 'every 1 hour'
            }
          },
          condition: {
            script: {
              script: ''
            }
          },
          transform: {
            script: {
              script: ''
            }
          },
          report : true,
          actions: {
            report_admin: {
              throttle_period: '15m',
              report: {
                to: 'report@localhost',
                from: 'sentinl@localhost',
                subject: 'Sentinl Report',
                priority: 'high',
                body: 'Sample Sentinl Screenshot Report',
                save: true,
                snapshot : {
                  res : '1280x900',
                  url : 'http://127.0.0.1/app/kibana#/dashboard/Alerts',
                  path : '/tmp/',
                  params : {
                    username : 'username',
                    password : 'password',
                    delay : 5000,
                    crop : false
                  }
                }
              }
            }
          }
        }
      };
    }
    $scope.watchers.unshift(newwatcher);
  };

  var currentTime = moment($route.current.locals.currentTime);
  $scope.currentTime = currentTime.format('HH:mm:ss');
  var utcTime = moment.utc($route.current.locals.currentTime);
  $scope.utcTime = utcTime.format('HH:mm:ss');
  var unsubscribe = $interval(function () {
    $scope.currentTime = currentTime.add(1, 'second').format('HH:mm:ss');
    $scope.utcTime = utcTime.add(1, 'second').format('HH:mm:ss');
  }, 1000);
  $scope.$watch('$destroy', unsubscribe);

});

// NEW END

uiModules
.get('api/sentinl', [])
.controller('sentinlAbout', function ($scope, $route, $interval, timefilter, Notifier) {
  $scope.title = 'Sentinl';
  $scope.description = 'Kibana Alert App for Elasticsearch';
  timefilter.enabled = false;
  $scope.notify = new Notifier();

  if (!$scope.notified) {
    $scope.notify.warning('SENTINL is a work in progress! Use at your own risk!');
    $scope.notified = true;
  }

  var currentTime = moment($route.current.locals.currentTime);
  $scope.currentTime = currentTime.format('HH:mm:ss');
  var utcTime = moment.utc($route.current.locals.currentTime);
  $scope.utcTime = utcTime.format('HH:mm:ss');
  var unsubscribe = $interval(function () {
    $scope.currentTime = currentTime.add(1, 'second').format('HH:mm:ss');
    $scope.utcTime = utcTime.add(1, 'second').format('HH:mm:ss');
  }, 1000);
  $scope.$watch('$destroy', unsubscribe);
});
