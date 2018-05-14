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
      authType: 'kubernetes.io/basic-auth',
      clientType: "android",
      buildType: "debug"
    };
    
    $scope.buildTypeMap = {
      android: {
        label: "Android",
        buildTypes: [
          {
            id: "debug",
            label: "Debug"
          },
          {
            id: "release",
            label: "Release"
          }
        ]
      }
    };

    var buildConfigsVersion = APIService.getPreferredVersion('buildconfigs');
    var secretsVersion = APIService.getPreferredVersion('secrets');

    var secretName = function(clientConfig) {
      return [clientConfig.clientType, clientConfig.buildType, clientConfig.buildName].join('-');
    };

    var createBuildConfig = function(clientConfig, secret) {
      var buildConfig = {
        kind: 'BuildConfig',
        apiVersion: APIService.toAPIVersion(buildConfigsVersion),
        metadata: {
          generateName: clientConfig.buildName + '-'
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
                  name: "FH_CONFIG_CONTENT",
                  value: "cantbeempty"
                },
                {
                  name: "BUILD_CONFIG",
                  value: clientConfig.buildType
                }
              ]
            }
          }
        }
      };

      if(clientConfig.buildType === 'release') {
        buildConfig.spec.strategy.jenkinsPipelineStrategy.env.push({name: "BUILD_CREDENTIAL_ID", value: $scope.projectName + '-' + secretName(clientConfig)});
        buildConfig.spec.strategy.jenkinsPipelineStrategy.env.push({name: "BUILD_CREDENTIAL_ALIAS", value: clientConfig.androidKeyStoreKeyAlias});
      }

      if (secret) {
        buildConfig.spec.source.sourceSecret = {
          name: secret.metadata.name
        };
        // var credentialsIdEnv = {
        //   name: 'BUILD_CREDENTIAL_ID',
        //   value: secret.metadata.namespace + '-' + secret.metadata.name
        // };
        // var credentialsAliasEnv = {
        //   name: 'BUILD_CREDENTIAL_ALIAS',
        //   value: 'cantbeempty'
        // };
        // buildConfig.spec.strategy.jenkinsPipelineStrategy.env.push(credentialsIdEnv);
        // buildConfig.spec.strategy.jenkinsPipelineStrategy.env.push(credentialsAliasEnv);
      }

      return buildConfig;
    };

    var createSecret = function(clientConfig) {
      var secret = {
        apiVersion: APIService.toAPIVersion(secretsVersion),
        kind: 'Secret',
        metadata: {
          generateName: clientConfig.credentialsName + '-',
          labels: {
            'credential.sync.jenkins.openshift.io': 'true'
          }
        },
        type: clientConfig.authType,
        stringData: {}
      };

      switch (clientConfig.authType) {
        case 'kubernetes.io/basic-auth':

          // If the password/token is not entered either .gitconfig or ca.crt has to be provided
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
        kind: "Secret",
        metadata: {
          name: secretName(clientConfig),
          labels:  {
            "mobile-client-build": "true",
            "credential.sync.jenkins.openshift.io": "true"
          }
        },
        type: "Opaque",
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

    $scope.authTypes = [
      {
        id: 'kubernetes.io/basic-auth',
        label: 'Basic Authentication'
      },
      {
        id: 'kubernetes.io/ssh-auth',
        label: 'SSH Key'
      }
    ];

    $scope.createClientBuild = function() {
      console.log($scope.newClientBuild);

      if ($scope.newClientBuild.buildType === 'release') {
        var certSecret = createAndroidKeyStoreSecret($scope.newClientBuild);
        DataService.create(secretsVersion, null, certSecret, $scope.context)
          .then(function() {
            // $scope.navigateBack();
          })
          .catch(function(err) {
            console.log(err);
          });
      }
      
      if (!$scope.newClientBuild.isPrivateRepo) {
        var clientBuildConfig = createBuildConfig($scope.newClientBuild);
        DataService.create(buildConfigsVersion, null, clientBuildConfig, $scope.context)
          .then(function() {
            console.log($scope.newClientBuild);
            // $scope.navigateBack();
          })
          .catch(function(err) {
            console.log(err);
          });
      }

      if ($scope.newClientBuild.isPrivateRepo) {
        var secret = createSecret($scope.newClientBuild);
        DataService.create(secretsVersion, null, secret, $scope.context)
          .then(function(secret) {
            var secretclientBuildConfig = createBuildConfig($scope.newClientBuild, secret);
            return DataService.create(buildConfigsVersion, null, secretclientBuildConfig, $scope.context)
          })
          .then(function() {
            // $scope.navigateBack();
          })
          .catch(function(err) {
            console.log(err);
          });
      }
    };
  });
