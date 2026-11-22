// three.js and the loaders a scene needs, as one classic script: storyshot scenes load kit files with
// a plain <script>, and a module script would register its timeline too late.
// The key is lower-case on purpose: storyshot reads "THREE." in a scene as a request for its own Kit3.
import * as three from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
window.Bio3 = { three, GLTFLoader, RoomEnvironment };
