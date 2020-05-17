#!/usr/bin/env node
import { TokenCredentialsBase, interactiveLogin, LinkedSubscription, loginWithServicePrincipalSecret, AuthResponse } from "@azure/ms-rest-nodeauth";
import { updateIpRestriction, UpdateOptions, getAzureIpRanges, IpRangeByServiceTag } from "../lib";
import { getSubscriptionsFromTenants } from "@azure/ms-rest-nodeauth/dist/lib/subscriptionManagement/subscriptionUtils";
import inquirer, { Answers } from "inquirer";
import { program } from "commander";
import {  WebAppsGetConfigurationResponse } from "@azure/arm-appservice/esm/models";
import color from "colorts";
import Hook from "console-hook";

program
  .version(require("../../package.json").version)
  .option('-n, --sitename <sitename>', 'target site name (required)')
  .option('-t, --servicetag <servicetag>', 'service tag for filtering (required)')
  .option('-r, --regexp', 'handle --servicetag value as regular expression')
  .option('-s, --scm', 'set to SCM site')
  .option('-S, --slotname <slotname>', 'target slot name of the site')
  .option('')
  .option('--clientId <clientId>', 'client Id of service principal')
  .option('--clientSecret <clientSecret>', 'secret of service principal')
  .option('--tenantId <tenantId>', 'tenannt Id of service principal')
  .option('')
  .option('--show-all-ip-ranges', 'show all IP ranges of Azure data center')
  .option('')
  .option('-d, --debug', 'output debug messages')
  .parse(process.argv);

if (!program.showAllIpRanges && (!program.sitename || !program.servicetag)) {
  console.error(color(`error: required option '--show-all-ip-ranges' 
  or
  '--sitename' and '--servicetag' are not specified`).red + '');
  process.exit(1);
}
(async () => {
  try {
    const sitename = program.sitename;
    const slotname = program.slotname;
    const serviceTag = program.servicetag;
    const serviceTagRegExp = new RegExp(serviceTag);
    const filterFunc = program.regexp
      ? (ipRangesByTag: IpRangeByServiceTag) => serviceTagRegExp.test(ipRangesByTag.id)
      : (ipRangesByTag: IpRangeByServiceTag) => ipRangesByTag.id === serviceTag;

    const ALL_SUBSCRIPTIONS = 'ALL SUBSCRIPTIONS';
    const myHook = Hook(console, true).attach('log', (method:any, args:any) => {
      args[0] = color(args[0]).yellow + '';
      console.error(...args);
    });

    const returns = await Promise.all([
      getAzureIpRanges(),
      program.showAllIpRanges || (async () => {
        const clientId = program.clientId;
        const clientSecret = program.clientSecret;
        const tenantId = program.tenantId;
        program.debug && clientId && clientSecret && tenantId && console.warn(color(`
  Service Principal information
  - Client Id:
    ${clientId}
  - Client Secret
    ${clientSecret}
  - Tenant Id
    ${tenantId}`).yellow + '');
        const credential: TokenCredentialsBase = (clientId && clientSecret && tenantId)
          ? await loginWithServicePrincipalSecret(clientId, clientSecret, tenantId)
          : await interactiveLogin();
        const token = await credential.getToken();
        const subscriptions: LinkedSubscription[] = await getSubscriptionsFromTenants(credential, [token.tenantId || ""]);
        const prompt = inquirer.createPromptModule({ output: process.stderr });
        const subscriptionId = await (async (linkedSubscriptions: LinkedSubscription[]) => {
          if (linkedSubscriptions.length === 1) return linkedSubscriptions[0].id;
          const selectedSubscription: Answers = await prompt([{
            type: 'list',
            name: 'selectedSubscription',
            message: 'Choose a subscription you want to use',
            choices: [`(${ALL_SUBSCRIPTIONS})`].concat(subscriptions.map(subscription => `${subscription.name} (${subscription.id})`))
          }]);
          return selectedSubscription.selectedSubscription.replace(/^.*\(([^\)]+)\)$/, '$1');
        })(subscriptions);
        return {
          credential,
          subscriptionIds: subscriptionId === ALL_SUBSCRIPTIONS ? subscriptions.map(subscription => subscription.id) : [subscriptionId]
        }
      })()
    ]);
    myHook.detach();
    if (program.showAllIpRanges) {
      console.log(JSON.stringify(returns[0], null, 2));
      return;
    }
    const updateOptions: UpdateOptions = { ...returns[1], ...{ sitename, slotname } };
    if (!program.scm) updateOptions.ipRanges = returns[0].filter(filterFunc);
    else updateOptions.scmIpRanges = returns[0].filter(filterFunc);
    program.debug && console.warn(color(`
  Applying following settings...
  - Subscription Id:
    ${updateOptions.subscriptionIds.length > 1 ? `(${ALL_SUBSCRIPTIONS})` : updateOptions.subscriptionIds[0]}
  - Site Name:
    ${sitename}
  - Slot Name:
    ${slotname || '(none)'}
  - SCM site:
    ${program.scm}
`).yellow + '');
    const config: WebAppsGetConfigurationResponse = await updateIpRestriction(updateOptions);
    console.log(JSON.stringify({
      ipSecurityRestrictions: config.ipSecurityRestrictions,
      scmIpSecurityRestrictions: config.scmIpSecurityRestrictions,
      scmIpSecurityRestrictionsUseMain: config.scmIpSecurityRestrictionsUseMain
    }, null, 2));
    program.debug && console.warn(color('done.').yellow + '');
  } catch (e) {
    console.error(color(e + '').red + '');
  }
})();
