# GameHunter (The Back End)

## Overview

Detached backend of my GameHunter app used solely for development purposes. The front end repo can be found [here](https://github.com/gfed53/ang-mongo-igdb).

While in development, serving up the backend separately - using a different port from the front end - allows for a better full stack development experience (than my previous experiences, at least). 

If you're developing an Angular app, running `ng serve` in the terminal serves the app and enables hot reloading (instant page refresh whenever you make a change in your code), but if you're going to use ExpressJS with the app, you may have to switch things up a bit.

Previously I would have to run `ng build && node server.js`, which doesn't reap the benefits of `ng serve`'s hot reloading, forcing me to have to reload the server everytime I made a change...which would also require a new build (every...time... !)

If you're looking for instructions on creating a build of this app, they can be found in the front end's [repo](https://github.com/gfed53/ang-mongo-igdb).
