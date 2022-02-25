# ngx-remote-desktop 

`ngx-remote-desktop` is an Angular component for connecting to a remote desktop using the [guacamole remote desktop gateway](https://guacamole.apache.org/)

This is based off a previous work of ILLGrenoble with little tweaks to make it work on Angular 11. It is based on the angular-8 branch of the upstream repo.
The work on this repo is highly experimental, and I have no prior experience on publishing packages to npm. Take this repo with a grain of salt.

We are using @ILLGrenoble/guacamole-common-js TypeScript definitions but we don't know how much outdated they are, mayba a TypeScript definition package will be available.

## Develop
 - `npm i`
 - Build the remote-desktop project with `ng build remote-desktop --watch`
 - Build the project with `ng serve --open`
 - You need a guacd + backend to test this project. I suggest [this one](https://github.com/wwt/guac).
 - You may need to use a proxy-config in Angular, in case your browser complains about CORS.

Caveats:

- Uploads require the app to be hosted as the same domain as the API, otherwise CORS will fail. To fix it temporarily in the dev environment, configure a chrome instance with `--disable-web-security` as arguments in the WebStorm browser list.

## What works so far

- We brought the repo to Angular 11
- I replaced the old build system with Angular's officially suggested library workflow
- I replaced deprecated components with newer ones
- I made AoT compiler happy by setting some HTML-exposed properties public
- RemoteDesktopService should work (I renamed it from RemoteDesktopManager, if that's confusing I can bring it back to the old name)
- Clipboard

## What doesn't

- Fullscreen
- Screenshot
- CSS in demo project is utterly broken
- ... probably something else

## What I plan to do

- Make sure the JS API doesn't use any outdated component
- Understand a little bit more how all the moving parts of Guacamole fit together
- Expand the exposed API, I'd really like to have support for file management and drag-n-drop.
- Complete the demo project
- Write docs one day

# Thanks
A big thank you to ILLGrenoble who wrote this project in the first stance and to the Guacamole project.
