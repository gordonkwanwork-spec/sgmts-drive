import assert from 'node:assert/strict';
import * as T from 'three';
import {characterLighting} from '../street-models.js';
const source=new T.MeshStandardMaterial({map:new T.Texture(),vertexColors:true});
const person=new T.Group();person.add(new T.Mesh(new T.BoxGeometry(),[source,source]));
characterLighting(person);
const other=new T.Group();other.add(new T.Mesh(new T.BoxGeometry(),source));characterLighting(other);
for(const material of person.children[0].material){
 assert.notEqual(material,source);assert.equal(material.map,source.map);assert.equal(material.vertexColors,true);
 const shader={uniforms:{},fragmentShader:T.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);
 assert.equal(shader.uniforms.characterGlow,person.userData.characterGlow);
 assert(shader.fragmentShader.includes('totalEmissiveRadiance += diffuseColor.rgb'));
 person.userData.characterGlow.value=.55;assert.equal(shader.uniforms.characterGlow.value,.55);
 person.userData.characterGlow.value=0;assert.equal(shader.uniforms.characterGlow.value,0);
}
assert.equal(other.userData.characterGlow.value,0,'Each character has independent lamp fill');
assert.equal(source.emissive.getHex(),0,'Shared source is unchanged');
console.log('Character lamp fill preserves textures/vertex colours, independent materials and daylight reset.');
