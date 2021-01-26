# ngx-remote-desktop 2021 relive

`ngx-remote-desktop` is an Angular component for connecting to a remote desktop using the [guacamole remote desktop gateway](https://guacamole.apache.org/)

This is based off a previous work of ILLGrenoble with little tweaks to make it work on Angular 11. It is based on the angular-8 branch of the upstream repo.
The work on this repo is highly experimental, and I have no prior experience on publishing packages to npm. Take this repo with a grain of salt.

You can find my work in progress in `feat/angular-library` branch. Here is the related [Pull Request](https://github.com/kriive/ngx-remote-desktop/pull/1) that track my work on this.

I am using @ILLGrenoble/guacamole-common-js TypeScript definitions but I really don't know how much outdated they are, maybe I will learn how to write a TypeScript definition package and replace that with mine.

## What works so far

- I successfully brought the repo to Angular 11
- I replaced the old build system with Angular's officially suggested library workflow
- I replaced deprecated components with newer ones
- I made AoT compiler happy by setting some HTML-exposed properties public
- RemoteDesktopService should work (I renamed it from RemoteDesktopManager, if that's confusing I can bring it back to the old name)

## What doesn't

- Fullscreen
- CSS in demo project is utterly broken
- ... probably something else

## What I plan to do

- Make sure the JS API doesn't use any outdated components
- Understand a little bit more how all the moving parts of Guacamole fit together
- Expand the exposed API, I'd really like to have support for file management and drag-n-drop.
- Complete the demo project
- Write docs one day

# Thanks
A big thank you to ILLGrenoble who wrote this project in the first stance and to the Guacamole project.