#!/usr/bin/env node

/**
 * QuantChat Azure Deployment Script
 * Deploys QuantChat to Azure using Azure REST APIs
 *
 * Prerequisites:
 * - Node.js installed
 * - Azure subscription
 * - AZURE_TOKEN environment variable set (from Azure CLI or Portal)
 *
 * Usage:
 * node deploy-azure.js --subscription <SUBSCRIPTION_ID> --resource-group <RG_NAME>
 */

const https = require('https');
const querystring = require('querystring');

// Configuration
const CONFIG = {
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID || 'YOUR_SUBSCRIPTION_ID',
  resourceGroup: 'quantchat-prod',
  location: 'eastus',
  appName: 'quantchat',
  environment: 'production',
  containerName: 'quantchat',
  registryName: 'quantchatregistry',
  dbName: 'quantchat-db-prod',
  redisName: 'quantchat-redis'
};

class AzureDeployer {
  constructor(subscriptionId, resourceGroup) {
    this.subscriptionId = subscriptionId;
    this.resourceGroup = resourceGroup;
    this.baseUrl = 'management.azure.com';
    this.apiVersion = '2021-03-01';
  }

  /**
   * Make HTTPS request to Azure REST API
   */
  async makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        port: 443,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.AZURE_TOKEN || ''}`
        }
      };

      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          try {
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: data ? JSON.parse(data) : null
            });
          } catch (e) {
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: data
            });
          }
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      if (body) {
        request.write(JSON.stringify(body));
      }
      request.end();
    });
  }

  /**
   * Create Resource Group
   */
  async createResourceGroup() {
    console.log(`📦 Creating resource group: ${this.resourceGroup}...`);
    const path = `/subscriptions/${this.subscriptionId}/resourcegroups/${this.resourceGroup}?api-version=2021-04-01`;

    const body = {
      location: CONFIG.location,
      tags: {
        project: 'QuantChat',
        environment: CONFIG.environment,
        managedBy: 'Terraform'
      }
    };

    try {
      const response = await this.makeRequest('PUT', path, body);
      if (response.status === 200 || response.status === 201) {
        console.log('✅ Resource group created/exists');
        return true;
      } else {
        console.error(`❌ Failed to create resource group: ${response.status}`);
        console.error(response.body);
        return false;
      }
    } catch (error) {
      console.error('❌ Error creating resource group:', error.message);
      return false;
    }
  }

  /**
   * Create Container Registry
   */
  async createContainerRegistry() {
    console.log(`🐳 Creating Container Registry: ${CONFIG.registryName}...`);
    const path = `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.ContainerRegistry/registries/${CONFIG.registryName}?api-version=2021-09-01`;

    const body = {
      location: CONFIG.location,
      sku: {
        name: 'Basic'
      },
      properties: {
        adminUserEnabled: true,
        publicNetworkAccess: 'Enabled'
      },
      tags: {
        project: 'QuantChat'
      }
    };

    try {
      const response = await this.makeRequest('PUT', path, body);
      if (response.status === 200 || response.status === 201) {
        console.log('✅ Container Registry created/exists');
        return true;
      } else {
        console.error(`❌ Failed to create registry: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error creating registry:', error.message);
      return false;
    }
  }

  /**
   * Create PostgreSQL Database
   */
  async createPostgresqlDatabase() {
    console.log(`🗄️  Creating PostgreSQL database: ${CONFIG.dbName}...`);
    const path = `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.DBforPostgreSQL/servers/${CONFIG.dbName}?api-version=2017-12-01`;

    const adminPassword = 'QuantChat@' + Math.random().toString(36).slice(-10).toUpperCase();

    const body = {
      location: CONFIG.location,
      properties: {
        administratorLogin: 'quantchat_admin',
        administratorLoginPassword: adminPassword,
        version: '11',
        storageMB: 51200,
        backupRetentionDays: 30,
        geoRedundantBackup: 'Disabled',
        sslEnforcement: 'ENABLED'
      },
      sku: {
        name: 'B_Gen5_1',
        tier: 'Basic',
        capacity: 1,
        family: 'Gen5'
      },
      tags: {
        project: 'QuantChat'
      }
    };

    try {
      const response = await this.makeRequest('PUT', path, body);
      if (response.status === 200 || response.status === 201) {
        console.log('✅ PostgreSQL database created/exists');
        console.log(`   Password: ${adminPassword} (save this!)`);
        return { success: true, password: adminPassword };
      } else {
        console.error(`❌ Failed to create database: ${response.status}`);
        return { success: false };
      }
    } catch (error) {
      console.error('❌ Error creating database:', error.message);
      return { success: false };
    }
  }

  /**
   * Create Redis Cache
   */
  async createRedisCache() {
    console.log(`⚡ Creating Redis cache: ${CONFIG.redisName}...`);
    const path = `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Cache/redis/${CONFIG.redisName}?api-version=2021-06-01`;

    const body = {
      location: CONFIG.location,
      properties: {
        sku: {
          name: 'Basic',
          family: 'C',
          capacity: 0
        },
        enableNonSslPort: false,
        publicNetworkAccess: 'Enabled'
      },
      tags: {
        project: 'QuantChat'
      }
    };

    try {
      const response = await this.makeRequest('PUT', path, body);
      if (response.status === 200 || response.status === 201) {
        console.log('✅ Redis cache created/exists');
        return true;
      } else {
        console.error(`❌ Failed to create Redis: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error creating Redis:', error.message);
      return false;
    }
  }

  /**
   * Create Container Instance
   */
  async createContainerInstance() {
    console.log(`🚀 Creating Container Instance: ${CONFIG.containerName}...`);
    const path = `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.ContainerInstance/containerGroups/${CONFIG.containerName}?api-version=2021-09-01`;

    const body = {
      location: CONFIG.location,
      properties: {
        containers: [{
          name: CONFIG.containerName,
          properties: {
            image: `${CONFIG.registryName}.azurecr.io/${CONFIG.appName}:latest`,
            resources: {
              requests: {
                cpu: 1.0,
                memoryInGb: 1.5
              }
            },
            ports: [{
              port: 3000,
              protocol: 'TCP'
            }],
            environmentVariables: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'PORT', value: '3000' },
              { name: 'DATABASE_URL', secureValue: 'postgresql://quantchat_admin:PASSWORD@quantchat-db-prod.postgres.database.azure.com:5432/quantchat' },
              { name: 'REDIS_URL', secureValue: 'redis://:PASSWORD@quantchat-redis.redis.cache.windows.net:6379' },
              { name: 'NEXTAUTH_URL', value: `http://${CONFIG.containerName}.${CONFIG.location}.azurecontainer.io:3000` },
              { name: 'NEXTAUTH_SECRET', secureValue: Math.random().toString(36).slice(-32) }
            ]
          }
        }],
        osType: 'Linux',
        ipAddress: {
          type: 'Public',
          dnsNameLabel: CONFIG.containerName,
          ports: [{
            port: 3000,
            protocol: 'TCP'
          }]
        },
        imageRegistryCredentials: [{
          server: `${CONFIG.registryName}.azurecr.io`,
          username: CONFIG.registryName,
          password: '' // Will need to be set from registry credentials
        }],
        restartPolicy: 'OnFailure'
      },
      tags: {
        project: 'QuantChat'
      }
    };

    try {
      const response = await this.makeRequest('PUT', path, body);
      if (response.status === 200 || response.status === 201) {
        console.log('✅ Container Instance created/exists');
        return true;
      } else {
        console.error(`❌ Failed to create container: ${response.status}`);
        console.error(response.body);
        return false;
      }
    } catch (error) {
      console.error('❌ Error creating container:', error.message);
      return false;
    }
  }

  /**
   * Deploy all resources
   */
  async deployAll() {
    console.log('\n');
    console.log('╔════════════════════════════════════════╗');
    console.log('║  QuantChat Azure Deployment Started   ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');

    if (!this.subscriptionId || this.subscriptionId === 'YOUR_SUBSCRIPTION_ID') {
      console.error('❌ Azure Subscription ID not set!');
      console.error('   Set AZURE_SUBSCRIPTION_ID environment variable');
      process.exit(1);
    }

    if (!process.env.AZURE_TOKEN) {
      console.error('❌ Azure authentication token not set!');
      console.error('   Set AZURE_TOKEN environment variable');
      console.error('   Get token using: az account get-access-token --query accessToken');
      process.exit(1);
    }

    try {
      // Create resource group
      const rgCreated = await this.createResourceGroup();
      if (!rgCreated) throw new Error('Failed to create resource group');

      // Create container registry
      const registryCreated = await this.createContainerRegistry();
      if (!registryCreated) throw new Error('Failed to create container registry');

      // Create PostgreSQL database
      const dbResult = await this.createPostgresqlDatabase();
      if (!dbResult.success) throw new Error('Failed to create PostgreSQL database');

      // Create Redis cache
      const redisCreated = await this.createRedisCache();
      if (!redisCreated) throw new Error('Failed to create Redis cache');

      // Create container instance
      const containerCreated = await this.createContainerInstance();
      if (!containerCreated) throw new Error('Failed to create container instance');

      console.log('\n');
      console.log('╔════════════════════════════════════════╗');
      console.log('║  ✅ Deployment Completed!             ║');
      console.log('╚════════════════════════════════════════╝');
      console.log('');
      console.log('📋 Deployment Summary:');
      console.log(`   Resource Group: ${this.resourceGroup}`);
      console.log(`   Container Registry: ${CONFIG.registryName}.azurecr.io`);
      console.log(`   PostgreSQL Server: ${CONFIG.dbName}`);
      console.log(`   Redis Cache: ${CONFIG.redisName}`);
      console.log(`   Container Instance: ${CONFIG.containerName}`);
      console.log('');
      console.log('🔗 Application URL (when ready):');
      console.log(`   http://${CONFIG.containerName}.${CONFIG.location}.azurecontainer.io:3000`);
      console.log('');
      console.log('⚠️  Next Steps:');
      console.log('   1. Push Docker image to registry');
      console.log('   2. Update container environment variables with actual credentials');
      console.log('   3. Wait 2-3 minutes for container to start');
      console.log('   4. Access application via the URL above');
      console.log('');

    } catch (error) {
      console.error('\n❌ Deployment failed:', error.message);
      process.exit(1);
    }
  }
}

// Main execution
const deployer = new AzureDeployer(CONFIG.subscriptionId, CONFIG.resourceGroup);
deployer.deployAll().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
