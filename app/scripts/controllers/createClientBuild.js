'use strict';

/**
 * @ngdoc function
 * @name openshiftConsole.controller:CreateClientBuildController
 * @description
 * # CreateClientBuildController
 * Controller of the openshiftConsole
 */
angular.module('openshiftConsole')
  .controller('CreateClientBuildController', function(
    $location,
    $routeParams,
    $scope,
    $window,
    APIService,
    DataService,
    Navigate,
    ProjectsService,
    SOURCE_URL_PATTERN
  ) {

    var buildConfigsVersion = APIService.getPreferredVersion('buildconfigs');
    var secretsVersion = APIService.getPreferredVersion('secrets');

    $scope.alerts = {};
    $scope.projectName = $routeParams.project;
    $scope.sourceURLPattern = SOURCE_URL_PATTERN;

    $scope.breadcrumbs = [
      {
         title: 'mobile client',
         link: 'project/' + $scope.projectName + '/browse/mobile-clients/' + $routeParams.mobileclient
      },
      {
        title: 'Create client build'
      }
    ];

    $scope.newClientBuild = {
      authType: 'public',
      clientType: 'android',
      buildType: 'debug'
    };
    
    $scope.buildTypeMap = {
      android: {
        label: 'Android',
        buildTypes: [
          {
            id: 'debug',
            label: 'Debug'
          },
          {
            id: 'release',
            label: 'Release'
          }
        ]
      }
    };

    $scope.authTypes = [
      {
        id: 'public',
        label: 'Public'
      },
      {
        id: 'kubernetes.io/basic-auth',
        label: 'Basic Authentication'
      },
      {
        id: 'kubernetes.io/ssh-auth',
        label: 'SSH Key'
      }
    ];

    var secretName = function(clientConfig) {
      return [clientConfig.clientType, clientConfig.buildType, clientConfig.buildName].join('-');
    };

    var createBuildConfig = function(clientConfig, secret) {
      var buildConfig = {
        kind: 'BuildConfig',
        apiVersion: APIService.toAPIVersion(buildConfigsVersion),
        metadata: {
          name: clientConfig.buildName
        },
        spec: {
          source: {
            git: {
              uri: clientConfig.gitUri,
              ref: clientConfig.gitRef
            }
          },
          strategy: {
            jenkinsPipelineStrategy: {
              jenkinsfilePath: clientConfig.jenkinsfilePath,
              env: [
                {
                  name: 'FH_CONFIG_CONTENT',
                  value: 'value'
                },
                {
                  name: 'BUILD_CONFIG',
                  value: clientConfig.buildType
                }
              ]
            }
          }
        }
      };

      if(clientConfig.buildType === 'release') {
        buildConfig.spec.strategy.jenkinsPipelineStrategy.env.push({name: 'BUILD_CREDENTIAL_ID', value: $scope.projectName + '-' + secretName(clientConfig)});
        buildConfig.spec.strategy.jenkinsPipelineStrategy.env.push({name: 'BUILD_CREDENTIAL_ALIAS', value: clientConfig.androidKeyStoreKeyAlias});
      }

      if (clientConfig.authType !== 'public') {
        buildConfig.spec.source.sourceSecret = {
          name: clientConfig.credentialsName
        };
      }

      return buildConfig;
    };

    var createSecret = function(clientConfig) {
      var secret = {
        apiVersion: APIService.toAPIVersion(secretsVersion),
        kind: 'Secret',
        metadata: {
          name: clientConfig.credentialsName,
        },
        type: clientConfig.authType,
        stringData: {}
      };

      switch (clientConfig.authType) {
        case 'kubernetes.io/basic-auth':
          if (clientConfig.passwordToken) {
            secret.stringData.password = clientConfig.passwordToken;
          } else {
            secret.type = 'Opaque';
          }
          if (clientConfig.username) {
            secret.stringData.username = clientConfig.username;
          }
          break;
        case 'kubernetes.io/ssh-auth':
          secret.stringData['ssh-privatekey'] = clientConfig.privateKey;
          break;
      }
      return secret;
    };

    var createAndroidKeyStoreSecret = function(clientConfig) {
      return {
        apiVersion: APIService.toAPIVersion(secretsVersion),
        kind: 'Secret',
        metadata: {
          name: secretName(clientConfig),
          labels:  {
            'mobile-client-build': 'true',
            'credential.sync.jenkins.openshift.io': 'true'
          }
        },
        type: 'Opaque',
        stringData: {
          certificate: clientConfig.androidKeyStore,
          password: clientConfig.androidKeyStorePassword
        }
      };
    };

    ProjectsService
      .get($routeParams.project)
      .then(_.spread(function(project, context) {
        $scope.project = project;
        $scope.context = context;
    }));

    $scope.navigateBack = function() {
      if ($routeParams.then) {
        $location.url($routeParams.then);
        return;
      }

      $window.history.back();
    };

    $scope.setAdvancedOptions = function(value) {
      $scope.advancedOptions = value;
    };

    $scope.createClientBuild = function() {
      if ($scope.newClientBuild.buildType === 'release') {
        var certSecret = createAndroidKeyStoreSecret($scope.newClientBuild);
        DataService.create(secretsVersion, null, certSecret, $scope.context)
          .then(function() {
            $scope.navigateBack();
          })
          .catch(function(err) {
            console.log(err);
          });
      }
      
      if ($scope.newClientBuild.authType === 'public') {
        var clientBuildConfig = createBuildConfig($scope.newClientBuild);
        DataService.create(buildConfigsVersion, null, clientBuildConfig, $scope.context)
          .then(function() {
            console.log($scope.newClientBuild);
            $scope.navigateBack();
          })
          .catch(function(err) {
            console.log(err);
          });
      }

      if ($scope.newClientBuild.authType !== 'public') {
        var secret = createSecret($scope.newClientBuild);
        DataService.create(secretsVersion, null, secret, $scope.context)
          .then(function(secret) {
            var secretclientBuildConfig = createBuildConfig($scope.newClientBuild, secret);
            return DataService.create(buildConfigsVersion, null, secretclientBuildConfig, $scope.context);
          })
          .then(function() {
            $scope.navigateBack();
          })
          .catch(function(err) {
            console.log(err);
          });
      }
    };
  });
