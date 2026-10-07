// Independent visual preview only. No assessment data or score storage is used.
export const ASSESSMENT_DIMENSIONS = Object.freeze(['景色','交通便利程度','美食','服务','海水','海洋生物','酒店设施','性价比']);
export const ISLAND_LAYOUT = Object.freeze({
  building: Object.freeze({x:-.16,z:-.40,y:.637}),
  table: Object.freeze({x:.84,z:.15,y:.614}),
  // Keep these spaces unoccupied; their future objects/score rules are undefined.
  shorelineAccess: Object.freeze({xMin:-1.62,xMax:-.63,zMin:.50,zMax:1.15}),
  openSea: Object.freeze({outerHalfExtent:2.65,innerAvoidRadius:1.68}),
});
